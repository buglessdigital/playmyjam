// YouTube yanıtlarını okumak için SAF yardımcılar. Hiçbir şey import etmez —
// böylece hem uygulamadan (lib/youtube.ts) hem de node ile doğrudan koşan
// tohumlama betiğinden (scripts/seed-catalog.ts) aynı kod kullanılabiliyor.
// Aksi halde tohumlanan satırların başlık/sanatçı biçimi uygulamanınkinden
// ayrışır ve eşleştirme tutmaz.

// "Sanatçı - Şarkı (Official Video)" kalıbından temiz başlık/sanatçı çıkarır.
// YouTube yapısal artist alanı vermez; tek kaynak video başlığı + kanal adı.
const TITLE_NOISE_RE =
  /\s*[([](?:official\s*(?:music\s*)?(?:video|audio|clip)|lyric\s*video|lyrics?|visualizer|audio|video|klip|s[öo]zleri|hd|4k|hq)[)\]]\s*/gi;

// "|" ile ayrılmış gürültü bölümleri: "Şarkı | Official Music Video" gibi
const NOISE_SEGMENT_RE =
  /official|music\s*video|lyric|visualizer|audio|video|klip|s[öo]zleri|4k|hd|hq/i;

export function parseVideoTitle(
  rawTitle: string,
  channelTitle: string
): { title: string; artist: string } {
  let cleaned = rawTitle.replace(TITLE_NOISE_RE, " ").replace(/\s{2,}/g, " ").trim();

  if (cleaned.includes("|")) {
    const parts = cleaned.split("|").map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((p) => !NOISE_SEGMENT_RE.test(p));
    cleaned = (kept.length > 0 ? kept : parts.slice(0, 1)).join(" - ").trim();
  }

  // "X - Topic" kanalları YouTube'un otomatik resmi ses kanallarıdır — kanal adı sanatçıdır
  const topicMatch = channelTitle.match(/^(.+?)\s*-\s*Topic$/i);
  if (topicMatch) {
    return { title: cleaned, artist: topicMatch[1].trim() };
  }

  const dash = cleaned.search(/\s[-–—]\s/);
  if (dash > 0) {
    const artist = cleaned.slice(0, dash).trim();
    const title = cleaned.slice(dash + 3).trim();
    if (artist && title) return { title, artist };
  }

  return { title: cleaned, artist: channelTitle.trim() };
}

// ISO8601 süre (PT3M45S) → ms
export function parseISODuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return ((Number(h ?? 0) * 60 + Number(min ?? 0)) * 60 + Number(s ?? 0)) * 1000;
}

export function videoThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// "https://youtu.be/ID", "watch?v=ID", "/shorts/ID", çıplak kimlik → ID
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  // Çıplak kimlik: tam 11 karakter ve başka hiçbir şey
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}
