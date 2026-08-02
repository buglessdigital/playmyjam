import { artistKey, primaryArtist, type VenueSong } from "@/components/browse/browse-types";

// "Benzer" önerileri tamamen mekanın çalınabilir listesinden üretilir — YouTube'un
// related-video ucu 2023'te kapandığı için harici öneri kaynağı yok, zaten öneriler
// yalnızca o mekanda çalınabilen şarkılardan çıkmalı.

export type SimilarTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  duration_ms: number;
};

export type SimilarArtist = {
  key: string;
  name: string;
  coverUrl: string;
  songCount: number;
  /** İç sıralama ağırlığı — UI'da gösterilmez */
  score: number;
};

// Türkçe karakterleri ASCII'ye indirger, noktalama atar: "Dünyanın Sonuna" → "dunyanin sonuna".
// ı/İ NFD ile ayrışmadığı için önce elle eşlenir.
export function fold(text: string): string {
  return text
    .replace(/[İI]/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Başlıklarda hemen her şarkıda geçen, benzerlik taşımayan kelimeler
const TITLE_STOPWORDS = new Set([
  "official", "video", "audio", "lyrics", "lyric", "visualizer", "klip", "sozleri", "sozler",
  "feat", "ft", "prod", "remix", "mix", "version", "versiyon", "akustik", "acoustic",
  "live", "canli", "cover", "music", "full", "album", "original", "radio", "edit",
  "extended", "remastered", "hd", "4k", "hq", "the", "and", "ile", "bir", "ama",
]);

function titleTokens(title: string): string[] {
  return fold(title)
    .split(" ")
    .filter((t) => t.length > 2 && !TITLE_STOPWORDS.has(t));
}

// Benzerlik puanı: sanatçı eşleşmesi baskın sinyal, başlık örtüşmesi ve süre yakınlığı
// destekleyici, mekandaki popülerlik ise eşitlik bozucu.
export function similarityScore(track: SimilarTrack, candidate: VenueSong): number {
  let score = 0;

  const trackKey = artistKey(track.artist);
  const candKey = artistKey(candidate.artist);

  if (trackKey && trackKey === candKey) {
    score += 100;
  } else {
    // Düet/feat: sanatçı adlarından biri diğerinin listesinde geçiyor
    const trackPrimary = fold(primaryArtist(track.artist));
    const candPrimary = fold(primaryArtist(candidate.artist));
    const trackAll = fold(track.artist);
    const candAll = fold(candidate.artist);
    if (
      (trackPrimary.length > 2 && candAll.includes(trackPrimary)) ||
      (candPrimary.length > 2 && trackAll.includes(candPrimary))
    ) {
      score += 55;
    }
  }

  // Aynı şarkının başka yorumu, aynı albüm/seri adı vb.
  const trackTokens = new Set(titleTokens(track.title));
  if (trackTokens.size > 0) {
    const shared = titleTokens(candidate.title).filter((t) => trackTokens.has(t)).length;
    score += Math.min(shared, 3) * 12;
  }

  // Yakın süre ~ yakın tempo/tür; zayıf ama katalogda başka sinyal yok
  if (track.duration_ms > 0 && candidate.duration_ms > 0) {
    if (Math.abs(track.duration_ms - candidate.duration_ms) <= 45_000) score += 6;
  }

  // Doygunlaşan popülerlik katkısı — çok çalınan şarkılar öne geçsin ama
  // sanatçı eşleşmesini ezmesin
  score += Math.min(candidate.play_count, 20) * 0.8;

  return score;
}

export function similarSongsOfArtist(catalog: VenueSong[], key: string): VenueSong[] {
  return catalog
    .filter((s) => s.in_venue_list && artistKey(s.artist) === key)
    .sort((a, b) => b.play_count - a.play_count || a.title.localeCompare(b.title, "tr"));
}

interface BuildOptions {
  songLimit?: number;
  artistLimit?: number;
}

/**
 * Mekan kataloğundan bu şarkıya benzer şarkılar + önerilen sanatçılar.
 * Yalnızca in_venue_list = true olan (yani gerçekten sıraya eklenebilen) şarkılar döner.
 */
export function buildSimilar(
  track: SimilarTrack,
  catalog: VenueSong[],
  { songLimit = 12, artistLimit = 12 }: BuildOptions = {}
): { songs: VenueSong[]; artists: SimilarArtist[] } {
  const scored = catalog
    .filter((s) => s.in_venue_list && s.youtube_video_id !== track.youtube_video_id)
    .map((song) => ({ song, score: similarityScore(track, song) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.song.play_count - a.song.play_count ||
        a.song.title.localeCompare(b.song.title, "tr")
    );

  const trackArtist = artistKey(track.artist);
  const artistMap = new Map<string, SimilarArtist>();

  for (const { song, score } of scored) {
    const name = primaryArtist(song.artist);
    if (!name) continue;
    const key = name.toLocaleLowerCase("tr");
    if (key === trackArtist) continue; // bu sayfanın sanatçısı "öneri" değil
    const entry = artistMap.get(key);
    if (!entry) {
      artistMap.set(key, { key, name, coverUrl: song.album_cover_url, songCount: 1, score });
    } else {
      entry.songCount += 1;
      // Ek şarkılar sıralamayı biraz iter; tek yüksek puanlı şarkı listeyi ele geçirmesin
      entry.score += score * 0.35;
      if (!entry.coverUrl) entry.coverUrl = song.album_cover_url;
    }
  }

  const artists = [...artistMap.values()]
    .sort((a, b) => b.score - a.score || b.songCount - a.songCount)
    .slice(0, artistLimit);

  return { songs: scored.slice(0, songLimit).map((s) => s.song), artists };
}
