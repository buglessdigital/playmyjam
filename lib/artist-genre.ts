import { supabaseAdmin } from "@/lib/supabase/admin";
import { fold } from "@/lib/song-match";

// Sanatçı → tür (Mekanlar haritası, bkz. 0073 artist_genres).
//
// Şemada tür yok; YouTube da vermiyor. iTunes Search API anahtarsız ve kotasız
// (dış katalog aramasında zaten kullanılıyor, bkz. lib/discover.ts). Sanatçı
// başına BİR istek: adıyla şarkı aranır, sanatçısı tutan sonuçların en sık
// türü alınır. Sanatçı-düzeyi aramadan daha isabetli çıktı (elektronik
// isimler sanatçı olarak çoğu zaman hiç bulunmuyor).
//
// Türler sanatçıya bağlı, mekana değil: bir kez öğrenilen her mekanda geçer.

const ITUNES = "https://itunes.apple.com/search";
const TIMEOUT_MS = 2500;
/** "Bulamadık" kaydı bu kadar sonra yeniden denenir */
const RETRY_NULL_MS = 30 * 24 * 60 * 60 * 1000;

export function artistKey(artist: string): string {
  return fold(artist).slice(0, 200);
}

type Row = { artist_key: string; genre: string | null; looked_up_at: string };

/** Önbellekteki türler; hiç bakılmamış ya da yeniden bakılması gerekenler `stale`'de. */
export async function readArtistGenres(
  artists: string[]
): Promise<{ genres: Map<string, string | null>; stale: string[] }> {
  const genres = new Map<string, string | null>();
  const keys = [...new Set(artists.map(artistKey).filter(Boolean))];
  if (keys.length === 0) return { genres, stale: [] };

  const { data } = await supabaseAdmin
    .from("artist_genres")
    .select("artist_key, genre, looked_up_at")
    .in("artist_key", keys);

  const now = Date.now();
  const fresh = new Set<string>();
  for (const row of (data ?? []) as Row[]) {
    genres.set(row.artist_key, row.genre);
    if (row.genre || now - Date.parse(row.looked_up_at) < RETRY_NULL_MS) fresh.add(row.artist_key);
  }
  const stale = artists.filter((a, i, all) => {
    const k = artistKey(a);
    return k && !fresh.has(k) && all.findIndex((b) => artistKey(b) === k) === i;
  });
  return { genres, stale };
}

type ItunesSong = { artistName?: string; primaryGenreName?: string };

// Aynı sanatçı aynı anda birden çok kartta aranırsa iTunes'a tek istek gider
const lookups = new Map<string, Promise<string | null | undefined>>();

function lookupGenre(artist: string): Promise<string | null | undefined> {
  const key = artistKey(artist);
  const running = lookups.get(key);
  if (running) return running;
  const p = fetchGenre(artist).finally(() => lookups.delete(key));
  lookups.set(key, p);
  return p;
}

async function fetchGenre(artist: string): Promise<string | null | undefined> {
  const params = new URLSearchParams({
    term: artist,
    entity: "song",
    attribute: "artistTerm",
    country: "TR",
    limit: "20",
  });
  try {
    const res = await fetch(`${ITUNES}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "PlayMyJam/1.0 (+https://playmyjam.com.tr)" },
      cache: "no-store",
    });
    // 403/429: iTunes'un dakikalık sınırı — "bulunamadı" diye kaydedilmez, sonra yeniden denenir
    if (!res.ok) return undefined;
    const json = (await res.json()) as { results?: ItunesSong[] };
    const want = artistKey(artist);
    const counts = new Map<string, number>();
    for (const r of json.results ?? []) {
      // "Sezen Aksu & Tarkan" da Sezen Aksu sayılır; başka sanatçının şarkısı sayılmaz
      if (!r.primaryGenreName || !r.artistName || !fold(r.artistName).includes(want)) continue;
      counts.set(r.primaryGenreName, (counts.get(r.primaryGenreName) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [genre, count] of counts) {
      if (count > bestCount) {
        best = genre;
        bestCount = count;
      }
    }
    return best;
  } catch {
    return undefined;
  }
}

/**
 * Verilen sanatçıların türünü iTunes'tan öğrenip önbelleğe yazar. Paralel
 * çalışır; iTunes'u yormamak için çağıran tarafta sayı sınırlı tutulmalı.
 * Dönen harita yalnız bu turda öğrenilenleri içerir.
 */
export async function fillArtistGenres(artists: string[]): Promise<Map<string, string | null>> {
  const learned = new Map<string, string | null>();
  const results = await Promise.all(artists.map(async (a) => [a, await lookupGenre(a)] as const));

  const rows: { artist_key: string; artist: string; genre: string | null; looked_up_at: string }[] = [];
  const now = new Date().toISOString();
  for (const [artist, genre] of results) {
    if (genre === undefined) continue; // ağ/sınır hatası: kayıt yok, sonra yeniden
    const key = artistKey(artist);
    learned.set(key, genre);
    rows.push({ artist_key: key, artist, genre, looked_up_at: now });
  }
  if (rows.length) {
    await supabaseAdmin.from("artist_genres").upsert(rows, { onConflict: "artist_key" });
  }
  return learned;
}
