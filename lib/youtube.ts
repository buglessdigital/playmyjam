import { parseVideoTitle, parseISODuration, videoThumbnail } from "@/lib/youtube-parse";

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

// Başlık/süre/kapak çözümleme lib/youtube-parse.ts'te (saf, importsuz) —
// tohumlama betiği de aynı kodu kullanıyor.
export { parseVideoTitle, parseISODuration, videoThumbnail };

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

// accessToken verilirse istek mekanın kendi YouTube hesabı adına gider: gizli
// listeler ancak böyle okunabilir. Kota yine bizim projemizden düşer.
async function fetchJson<T>(url: string, accessToken?: string): Promise<T> {
  const res = await fetch(url, accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined);
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
export async function getVideoDetails(videoIds: string[], accessToken?: string): Promise<TrackDetails[]> {
  const tracks: TrackDetails[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status",
      id: batch.join(","),
      key: API_KEY,
    });
    const data = await fetchJson<{ items?: VideoItem[] }>(`${API_BASE}/videos?${params}`, accessToken);
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
  videoIds: string[],
  accessToken?: string
): Promise<Map<string, VideoRefresh | null>> {
  const result = new Map<string, VideoRefresh | null>(videoIds.map((id) => [id, null]));
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status",
      id: batch.join(","),
      key: API_KEY,
    });
    const data = await fetchJson<{ items?: VideoItem[] }>(`${API_BASE}/videos?${params}`, accessToken);
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

// search.list (100 birim) BURADAN KALDIRILDI — 22 Ağu 2026.
// Tek bir kalabalık gece günlük kotanın tamamını bitirebiliyordu ve kota artışı
// başvurusu onay beklerken bu risk taşınamazdı. Yerine geçen yol:
//   • ortak havuz (songs) — tohumlanmış katalog, 0 birim (scripts/seed-catalog.ts)
//   • admin'in yapıştırdığı bağlantı — videos.list, talep başına 1 birim
// Ayrıntı: lib/request-approval.ts (findInPool / resolveVideoLink).
//
// Şarkı detay kabuğu da artık buraya gelmiyor: bkz. lib/track-lookup.ts.
// Bu dosyada kalan çağrılar yalnızca playlist içe aktarma ve günlük senkron —
// ikisi de 1 birim/50 şarkı ve senkronun günlük tavanı 1000 birim.

// Playlist URL'sinden ("...list=PL..." veya çıplak kimlik) playlist id çıkarır
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/[?&]list=([A-Za-z0-9_-]{10,60})/);
  if (fromUrl) return fromUrl[1];
  if (/^[A-Za-z0-9_-]{10,60}$/.test(trimmed)) return trimmed;
  return null;
}

type PlaylistInfo = { title: string | null; itemCount: number | null; privacy: string | null };

// playlists.list (1 birim) — başlık + şarkı sayısı tek çağrıda.
// itemCount otomatik senkronun ön kontrolü: sayı değişmediyse liste hiç açılmaz
// (bkz. lib/playlist-sync.ts). Başarısız olursa null'lar döner, çağıran taraf akar.
export async function getPlaylistInfo(playlistId: string, accessToken?: string): Promise<PlaylistInfo> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails,status",
    id: playlistId,
    key: API_KEY,
  });
  try {
    const data = await fetchJson<{
      items?: Array<{
        snippet?: { title?: string };
        contentDetails?: { itemCount?: number };
        status?: { privacyStatus?: string };
      }>;
    }>(`${API_BASE}/playlists?${params}`, accessToken);
    const item = data.items?.[0];
    if (!item) return { title: null, itemCount: null, privacy: null };
    return {
      title: item.snippet?.title?.trim() || null,
      itemCount: typeof item.contentDetails?.itemCount === "number" ? item.contentDetails.itemCount : null,
      privacy: item.status?.privacyStatus ?? null,
    };
  } catch {
    return { title: null, itemCount: null, privacy: null };
  }
}

// playlists.list toplu (1 birim / 50 liste) — cron'un ön kontrolü.
// 100 mekanın listesini yoklamak günde 2 birim eder; asıl tasarruf burada.
// Yanıtta dönmeyen kimlik = liste silinmiş veya gizlenmiş → map'te yer almaz.
export async function getPlaylistItemCounts(
  playlistIds: string[]
): Promise<{ counts: Map<string, number>; units: number }> {
  const counts = new Map<string, number>();
  let units = 0;

  for (let i = 0; i < playlistIds.length; i += 50) {
    const batch = playlistIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "contentDetails",
      id: batch.join(","),
      maxResults: "50",
      key: API_KEY,
    });
    const data = await fetchJson<{
      items?: Array<{ id?: string; contentDetails?: { itemCount?: number } }>;
    }>(`${API_BASE}/playlists?${params}`);
    units++;
    for (const item of data.items ?? []) {
      if (item.id && typeof item.contentDetails?.itemCount === "number") {
        counts.set(item.id, item.contentDetails.itemCount);
      }
    }
  }

  return { counts, units };
}

export type OwnedPlaylist = {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string | null;
  privacy: string;
};

// playlists.list?mine=true (1 birim / 50 liste) — mekanın kendi hesabındaki listeler.
// YouTube Music'te oluşturulan listeler de burada döner; "Beğenilen Müzik" ve
// algoritmik karışımlar (Discover Mix vb.) API'de görünmez, seçicide de çıkmazlar.
const OWNED_PLAYLIST_MAX = 200;

export async function getMyPlaylists(accessToken: string): Promise<OwnedPlaylist[]> {
  const playlists: OwnedPlaylist[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,status",
      mine: "true",
      maxResults: "50",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await fetchJson<{
      nextPageToken?: string;
      items?: Array<{
        id?: string;
        snippet?: { title?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
        contentDetails?: { itemCount?: number };
        status?: { privacyStatus?: string };
      }>;
    }>(`${API_BASE}/playlists?${params}`, accessToken);

    for (const item of data.items ?? []) {
      if (!item.id) continue;
      playlists.push({
        id: item.id,
        title: item.snippet?.title?.trim() || "Adsız liste",
        itemCount: item.contentDetails?.itemCount ?? 0,
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
        privacy: item.status?.privacyStatus ?? "private",
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken && playlists.length < OWNED_PLAYLIST_MAX);

  // Boş listeler seçicide yer kaplamasın
  return playlists.filter((p) => p.itemCount > 0);
}

const PLAYLIST_MAX_ITEMS = 500;

// playlistItems.list (1 birim/sayfa) — public playlist'ler için OAuth gerekmez.
// Yalnızca ham video kimlikleri: detay (videos.list) ayrı bir adım, çünkü senkronda
// zaten tanıdığımız videolar için o çağrıyı hiç atmıyoruz.
export async function getPlaylistVideoIds(
  playlistId: string,
  accessToken?: string
): Promise<{ videoIds: string[]; units: number }> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  let units = 0;

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
    }>(`${API_BASE}/playlistItems?${params}`, accessToken);
    units++;
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) videoIds.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken && videoIds.length < PLAYLIST_MAX_ITEMS);

  return { videoIds: [...new Set(videoIds)], units };
}
