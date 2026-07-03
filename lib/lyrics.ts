export type LyricsLine = { timeMs: number; text: string };
export type LyricsResult = { synced: boolean; lines: LyricsLine[] };

const cache = new Map<string, { data: LyricsResult | null; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function parseSyncedLyrics(lrc: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const rawLine of lrc.split("\n")) {
    const match = rawLine.match(/^\[(\d{2}):(\d{2})(?:\.(\d{1,2}))?\](.*)$/);
    if (!match) continue;
    const [, mm, ss, cs, text] = match;
    const timeMs = parseInt(mm, 10) * 60000 + parseInt(ss, 10) * 1000 + (cs ? parseInt(cs.padEnd(2, "0"), 10) * 10 : 0);
    const trimmed = text.trim();
    if (trimmed) lines.push({ timeMs, text: trimmed });
  }
  return lines;
}

export async function getLyrics(
  cacheKey: string,
  title: string,
  artist: string,
  durationMs: number
): Promise<LyricsResult | null> {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    duration: String(Math.round(durationMs / 1000)),
  });

  let result: LyricsResult | null = null;
  try {
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      signal: AbortSignal.timeout(10000),
      // lrclib.net istek başına tanımlanabilir bir User-Agent öneriyor — yoksa yavaş kuyruğa düşebiliyor
      headers: { "User-Agent": "PlayMyJam/1.0 (+https://playmyjam.app)" },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data: { syncedLyrics?: string | null; plainLyrics?: string | null } = await res.json();
      if (data.syncedLyrics) {
        result = { synced: true, lines: parseSyncedLyrics(data.syncedLyrics) };
      } else if (data.plainLyrics) {
        result = {
          synced: false,
          lines: data.plainLyrics
            .split("\n")
            .filter((l) => l.trim())
            .map((text) => ({ timeMs: 0, text })),
        };
      }
    }
  } catch {
    result = null;
  }

  cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
