import { fold } from "@/lib/similar";

// Mekan listesinde karşılığı çıkmayan aramalar için DIŞ katalog araması.
//
// Neden YouTube değil: search.list her sorgu için ~100 birim yakıyor, günlük
// kota ile bir kalabalık gece bile çıkmıyor (bkz. app/api/search/route.ts).
// Buradaki iki kaynak da anahtarsız ve günlük kotasız:
//
//   • iTunes Search API — country=TR ile Türkçe katalog isabeti çok iyi
//   • Deezer public API — yabancı/uzun kuyruk repertuvarda daha geniş
//
// Sonuç yalnızca METİN: video id yok, çalınmaz. Müşteri buradan seçtiğinde
// serbest metin talep gider; mekan onaylarsa şarkı o an YouTube'da aranır
// (bkz. lib/request-approval.ts) — yani kota yalnızca onaylanan talep kadar.

export type DiscoverTrack = {
  /** Kaynak öneki + kaynak id — React key ve satır durumu için */
  key: string;
  title: string;
  artist: string;
  cover: string;
  duration_ms: number;
};

const ITUNES = "https://itunes.apple.com/search";
const DEEZER = "https://api.deezer.com/search";
const TIMEOUT_MS = 3500;
const LIMIT = 12;

// Aynı sorgu ikinci kez dış servise gitmesin. Yanıt ayrıca CDN'de de
// önbelleklenir (bkz. app/api/discover/route.ts); bu tabaka aynı fonksiyon
// örneğine düşen tekrarları toplar.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; tracks: DiscoverTrack[] }>();

function cacheGet(key: string): DiscoverTrack[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.tracks;
}

function cacheSet(key: string, tracks: DiscoverTrack[]) {
  // Basit LRU: en eski anahtar düşer
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), tracks });
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "PlayMyJam/1.0 (+https://playmyjam.com.tr)" },
      // Dinamik sorgu — Next'in fetch önbelleğine girmesin, kendi cache'imiz var
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Zaman aşımı / ağ hatası: bu kaynak yok sayılır, diğeri sonucu taşır
    return null;
  }
}

type ItunesRow = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
};

async function searchItunes(q: string): Promise<DiscoverTrack[]> {
  const url = `${ITUNES}?term=${encodeURIComponent(q)}&media=music&entity=song&limit=${LIMIT}&country=TR&lang=tr_tr`;
  const json = (await getJson(url)) as { results?: ItunesRow[] } | null;
  if (!json?.results) return [];

  return json.results.flatMap((r) => {
    if (!r.trackName || !r.artistName) return [];
    return [{
      key: `it:${r.trackId ?? `${r.artistName}-${r.trackName}`}`,
      title: r.trackName,
      artist: r.artistName,
      // 100x100 kapak satırda bulanık kalıyor — Apple aynı yoldan 200'lüğü veriyor
      cover: (r.artworkUrl100 ?? "").replace("100x100bb", "200x200bb"),
      duration_ms: r.trackTimeMillis ?? 0,
    }];
  });
}

type DeezerRow = {
  id?: number;
  title?: string;
  title_short?: string;
  duration?: number;
  artist?: { name?: string };
  album?: { cover_medium?: string };
};

async function searchDeezer(q: string): Promise<DiscoverTrack[]> {
  const url = `${DEEZER}?q=${encodeURIComponent(q)}&limit=${LIMIT}`;
  const json = (await getJson(url)) as { data?: DeezerRow[] } | null;
  if (!json?.data) return [];

  return json.data.flatMap((r) => {
    const title = r.title_short || r.title;
    const artist = r.artist?.name;
    if (!title || !artist) return [];
    return [{
      key: `dz:${r.id ?? `${artist}-${title}`}`,
      title,
      artist,
      cover: r.album?.cover_medium ?? "",
      duration_ms: (r.duration ?? 0) * 1000,
    }];
  });
}

function dedupeKey(t: DiscoverTrack): string {
  return `${fold(t.artist)}|${fold(t.title)}`;
}

/**
 * İki kaynağı paralel arar, birleştirir ve alaka sırasına dizer.
 *
 * Sıralama iki ölçüt: (1) sorgudaki kelimeleri karşılayan sonuç önce,
 * (2) karşılıklı sıra kaynaşması (RRF): her kaynaktaki konumun 1/(10+sıra)
 * karşılığı toplanır. Böylece hem iki katalogda birden çıkan hem de
 * kaynağının tepesinde duran kayıt öne geçer — "Blinding Lights"te The
 * Weeknd'in aslı, iki kaynakta da alt sıralarda görünen cover'ların üstünde
 * kalır. Düz "iki kaynakta da var" sayımı bunu beceremiyordu.
 */
export async function discoverTracks(query: string): Promise<DiscoverTrack[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const cacheKey = fold(q);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const [itunes, deezer] = await Promise.all([searchItunes(q), searchDeezer(q)]);

  const queryTokens = fold(q).split(" ").filter((t) => t.length > 1);
  const merged = new Map<string, { track: DiscoverTrack; score: number }>();
  const RRF_K = 10;

  const absorb = (tracks: DiscoverTrack[]) => {
    tracks.forEach((track, index) => {
      const key = dedupeKey(track);
      const points = 1 / (RRF_K + index);
      const existing = merged.get(key);
      if (existing) {
        // Aynı kayıt bir kez daha görüldü (öbür kaynak ya da aynı kaynağın
        // farklı albüm sürümü): puanı birikir, en iyi konum ödüllenir
        existing.score += points;
        if (!existing.track.cover && track.cover) existing.track.cover = track.cover;
        if (!existing.track.duration_ms && track.duration_ms) {
          existing.track.duration_ms = track.duration_ms;
        }
        return;
      }
      merged.set(key, { track, score: points });
    });
  };

  absorb(itunes);
  absorb(deezer);

  const scored = [...merged.values()].map((entry) => {
    const haystack = fold(`${entry.track.title} ${entry.track.artist}`);
    const hits = queryTokens.filter((token) => haystack.includes(token)).length;
    return { ...entry, hits };
  });

  const tracks = scored
    .sort((a, b) => b.hits - a.hits || b.score - a.score)
    .slice(0, 20)
    .map((entry) => entry.track);

  // Boş sonuç önbelleğe girmez: kaynakların zaman aşımına düştüğü tek bir an
  // yoksa o sorgu 24 saat boyunca "bulunamadı" kalırdı
  if (tracks.length > 0) cacheSet(cacheKey, tracks);
  return tracks;
}
