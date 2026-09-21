// Havuza (public.songs) girecek satırın süzgeci ve biçimi. Hem hasat betiği
// (scripts/seed-catalog.ts, node ile doğrudan koşar) hem günlük "yeni çıkanlar"
// cron'u (lib/catalog-new.ts) kullanıyor — ikisi ayrı süzgeç tutarsa havuza
// giren satırların biçimi ayrışır ve eşleştirme tutmaz.
//
// Uzantılı import bilerek: node'un tip ayıklaması uzantısız yolu çözemiyor.
import { parseISODuration, parseVideoTitle, videoThumbnail } from "./youtube-parse.ts";

// Havuza HİÇ girmemesi gereken içerik. Ölçüt "şarkı değil": canlı/remix gibi
// meşru sürümler elenmez, onlar seçim aşamasında geriye itilir
// (bkz. lib/song-match.ts). Amaç havuzu çöple doldurmamak.
const NOT_A_SONG =
  /\b(karaoke|instrumental|enstrumantal|playback|reaction|tepki|tutorial|nasil\s+calinir|full\s+album|tam\s+albüm|megamix|nonstop|dj\s*set|mix\s*20\d\d|greatest\s+hits|top\s+\d+|playlist|derleme|saatlik|1\s*hour|10\s*hours|asmr|sleep|lofi\s+radio)\b/i;

const MIN_MS = 45_000;
const MAX_MS = 12 * 60_000;

// videos.list çağrısında istenmesi gereken bölümler
export const CATALOG_VIDEO_PARTS = "snippet,contentDetails,statistics,status";

export type CatalogVideoItem = {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    categoryId?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean };
};

export type CatalogSongRow = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  channel_title: string;
  channel_id: string | null;
  view_count: number;
};

// null = havuza girmez (müzik dışı, gömülemez, süre dışı ya da şarkı değil)
export function toCatalogRow(v: CatalogVideoItem): CatalogSongRow | null {
  if (v.snippet?.categoryId && v.snippet.categoryId !== "10") return null; // Müzik dışı
  if (v.status?.embeddable === false) return null; // gömülü player'da çalmaz
  const duration = parseISODuration(v.contentDetails?.duration ?? "");
  if (duration < MIN_MS || duration > MAX_MS) return null;

  const rawTitle = v.snippet?.title ?? "";
  if (!rawTitle || NOT_A_SONG.test(rawTitle)) return null;

  const { title, artist } = parseVideoTitle(rawTitle, v.snippet?.channelTitle ?? "");
  if (!title || !artist) return null;

  return {
    youtube_video_id: v.id,
    title,
    artist,
    album_cover_url:
      v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? videoThumbnail(v.id),
    duration_ms: duration,
    channel_title: v.snippet?.channelTitle ?? "",
    channel_id: v.snippet?.channelId ?? null,
    view_count: Number(v.statistics?.viewCount ?? 0),
  };
}
