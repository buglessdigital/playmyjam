import { cacheLife } from "next/cache";

const API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

export type YouTubeTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  channel_title: string;
  view_count: number;
};

export type TrackDetails = YouTubeTrack & {
  release_date: string | null;
  external_url: string | null;
};

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

type VideoItem = {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean };
};

function toTrack(v: VideoItem): TrackDetails {
  const { title, artist } = parseVideoTitle(v.snippet?.title ?? "", v.snippet?.channelTitle ?? "");
  return {
    youtube_video_id: v.id,
    title,
    artist,
    album_cover_url:
      v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? videoThumbnail(v.id),
    duration_ms: parseISODuration(v.contentDetails?.duration ?? ""),
    channel_title: v.snippet?.channelTitle ?? "",
    view_count: Number(v.statistics?.viewCount ?? 0),
    release_date: v.snippet?.publishedAt ?? null,
    external_url: `https://www.youtube.com/watch?v=${v.id}`,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Kota dolduğunda Google 403 döner — çağıran taraf zarifçe yerel kataloga düşer
    if (res.status === 403 && body.includes("quota")) {
      throw new YouTubeQuotaError();
    }
    throw new Error(`YouTube API hatası (${res.status})`);
  }
  return res.json();
}

export class YouTubeQuotaError extends Error {
  constructor() {
    super("YouTube arama kotası doldu — yarın sıfırlanır");
    this.name = "YouTubeQuotaError";
  }
}

// videos.list (1 birim): süre + embed + izlenme. 50'şerlik parti halinde.
export async function getVideoDetails(videoIds: string[]): Promise<TrackDetails[]> {
  const tracks: TrackDetails[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status",
      id: batch.join(","),
      key: API_KEY,
    });
    const data = await fetchJson<{ items?: VideoItem[] }>(`${API_BASE}/videos?${params}`);
    for (const v of data.items ?? []) {
      // Embed'e kapalı veya süre dışı (canlı yayın/çok uzun) videolar gömülü player'da çalmaz
      if (v.status?.embeddable === false) continue;
      const dur = parseISODuration(v.contentDetails?.duration ?? "");
      if (dur < 1000 || dur > 3_600_000) continue;
      tracks.push(toTrack(v));
    }
  }
  return tracks;
}

export type VideoRefresh = {
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  channel_title: string;
  view_count: number;
  embeddable: boolean;
};

// YouTube Developer Policy III.E.4: 30 günden eski metadata tazelenmeli veya
// silinmeli (video id muaf). videos.list yanıtında hiç dönmeyen id silinmiş/
// gizlenmiş videodur → null (çağıran embeddable=false işaretler).
export async function refreshVideoMetadata(
  videoIds: string[]
): Promise<Map<string, VideoRefresh | null>> {
  const result = new Map<string, VideoRefresh | null>(videoIds.map((id) => [id, null]));
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status",
      id: batch.join(","),
      key: API_KEY,
    });
    const data = await fetchJson<{ items?: VideoItem[] }>(`${API_BASE}/videos?${params}`);
    for (const v of data.items ?? []) {
      const t = toTrack(v);
      result.set(v.id, {
        title: t.title,
        artist: t.artist,
        album_cover_url: t.album_cover_url,
        duration_ms: t.duration_ms,
        channel_title: t.channel_title,
        view_count: t.view_count,
        embeddable: v.status?.embeddable !== false,
      });
    }
  }
  return result;
}

// search.list (100 birim!) + videos.list (1 birim). Çağıran taraf önce yerel
// katalog + search_cache'e bakmalı — bu fonksiyon kotanın tek büyük tüketicisi.
export async function searchVideos(query: string): Promise<TrackDetails[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music
    videoEmbeddable: "true",
    regionCode: "TR",
    maxResults: "10",
    q: query,
    key: API_KEY,
  });
  const data = await fetchJson<{ items?: Array<{ id?: { videoId?: string } }> }>(
    `${API_BASE}/search?${params}`
  );
  const ids = (data.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((id): id is string => !!id);
  if (ids.length === 0) return [];
  const details = await getVideoDetails(ids);
  // search sırasını koru (alaka sıralaması)
  const order = new Map(ids.map((id, i) => [id, i]));
  return details.sort(
    (a, b) => (order.get(a.youtube_video_id) ?? 99) - (order.get(b.youtube_video_id) ?? 99)
  );
}

// Şarkı detay kabuğu için tek video (Spotify getTrackDetails'in yerine geçer)
export async function getTrackDetails(videoId: string): Promise<TrackDetails | null> {
  "use cache";
  cacheLife("days");

  const params = new URLSearchParams({
    part: "snippet,contentDetails,statistics,status",
    id: videoId,
    key: API_KEY,
  });
  const data = await fetchJson<{ items?: VideoItem[] }>(`${API_BASE}/videos?${params}`);
  const v = data.items?.[0];
  if (!v) return null;
  return toTrack(v);
}

// Playlist URL'sinden ("...list=PL..." veya çıplak kimlik) playlist id çıkarır
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/[?&]list=([A-Za-z0-9_-]{10,60})/);
  if (fromUrl) return fromUrl[1];
  if (/^[A-Za-z0-9_-]{10,60}$/.test(trimmed)) return trimmed;
  return null;
}

// playlistItems.list (1 birim/sayfa) — public playlist'ler için OAuth gerekmez
export async function getPlaylistItems(playlistId: string): Promise<TrackDetails[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: "contentDetails",
      playlistId,
      maxResults: "50",
      key: API_KEY,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await fetchJson<{
      nextPageToken?: string;
      items?: Array<{ contentDetails?: { videoId?: string } }>;
    }>(`${API_BASE}/playlistItems?${params}`);
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) videoIds.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken && videoIds.length < 500);

  return getVideoDetails([...new Set(videoIds)]);
}
