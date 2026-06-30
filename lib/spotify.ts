import { supabaseAdmin } from "@/lib/supabase/admin";
import { fillQueueToTen } from "@/lib/queue-fill";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

let clientCredentialsToken: { token: string; expiresAt: number } | null = null;

export async function getClientCredentialsToken(): Promise<string> {
  if (clientCredentialsToken && Date.now() < clientCredentialsToken.expiresAt) {
    return clientCredentialsToken.token;
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error("Failed to get Spotify client credentials token");

  const data = await res.json();
  clientCredentialsToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return clientCredentialsToken.token;
}

// Spotify refresh token'ı iptal edilmiş (kullanıcı bağlantıyı koparmış) — yeniden bağlanmak gerekir
export class SpotifyAuthRevokedError extends Error {
  constructor() {
    super("Spotify bağlantısı kopmuş, mekanı yeniden bağlayın");
    this.name = "SpotifyAuthRevokedError";
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      const body = await res.json().catch(() => null);
      if (body?.error === "invalid_grant" || res.status === 401) {
        throw new SpotifyAuthRevokedError();
      }
    }
    throw new Error(`Spotify token yenilenemedi (${res.status})`);
  }

  return res.json();
}

export async function getVenueAccessToken(venueId: string): Promise<string> {
  const { data: venue, error } = await supabaseAdmin
    .from("venues")
    .select("spotify_access_token, spotify_refresh_token, spotify_token_expires_at")
    .eq("id", venueId)
    .single();

  if (error || !venue?.spotify_refresh_token) {
    throw new Error("Venue Spotify hesabı bağlı değil");
  }

  const now = Date.now();
  if (venue.spotify_access_token && venue.spotify_token_expires_at && now < venue.spotify_token_expires_at) {
    return venue.spotify_access_token;
  }

  let refreshed: { access_token: string; expires_in: number };
  try {
    refreshed = await refreshAccessToken(venue.spotify_refresh_token);
  } catch (err) {
    if (err instanceof SpotifyAuthRevokedError) {
      // Token iptal edilmiş — geçersiz tokenları temizle ki admin yeniden bağlasın
      await supabaseAdmin
        .from("venues")
        .update({
          spotify_access_token: null,
          spotify_refresh_token: null,
          spotify_token_expires_at: null,
          spotify_account_id: null,
          spotify_account_name: null,
        })
        .eq("id", venueId);
    }
    throw err;
  }

  await supabaseAdmin
    .from("venues")
    .update({
      spotify_access_token: refreshed.access_token,
      spotify_token_expires_at: now + (refreshed.expires_in - 60) * 1000,
    })
    .eq("id", venueId);

  return refreshed.access_token;
}

export async function getActiveDeviceId(token: string): Promise<string | undefined> {
  const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  const devices: Array<{ id: string; is_active: boolean }> = data.devices ?? [];
  return (devices.find((d) => d.is_active) ?? devices[0])?.id;
}

export async function startTrack(
  token: string,
  trackId: string
): Promise<{ ok: boolean; error?: string }> {
  const deviceId = await getActiveDeviceId(token);
  if (!deviceId) {
    return { ok: false, error: "Spotify'da aktif cihaz yok. Spotify uygulamasını açın." };
  }

  // Repeat açıksa şarkı biter bitmez başa sarıyor ve kuyruk hiç ilerlemiyor — kapat
  await fetch(`https://api.spotify.com/v1/me/player/repeat?state=off&device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});

  const playRes = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
  });

  if (!playRes.ok && playRes.status !== 204) {
    return { ok: false, error: `Spotify play hatası: ${playRes.status} ${await playRes.text()}` };
  }
  return { ok: true };
}

export async function playNextFromQueue(
  venueId: string,
  token: string
): Promise<{ started: boolean; queueEmpty?: boolean; error?: string }> {
  await supabaseAdmin
    .from("queue")
    .update({ status: "played", played_at: new Date().toISOString() })
    .eq("venue_id", venueId)
    .eq("status", "playing");

  const { data: nextItem } = await supabaseAdmin
    .from("queue")
    .select("id, song_id, songs(spotify_track_id)")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Replenish queue after consuming a song — fire-and-forget
  fillQueueToTen(venueId).catch(() => {});

  if (!nextItem) {
    await supabaseAdmin
      .from("now_playing")
      .update({ song_id: null, is_playing: false, progress_ms: 0 })
      .eq("venue_id", venueId);
    return { started: false, queueEmpty: true };
  }

  const songRel = nextItem.songs as unknown as
    | { spotify_track_id: string }
    | { spotify_track_id: string }[]
    | null;
  const song = Array.isArray(songRel) ? songRel[0] : songRel;
  if (!song?.spotify_track_id) return { started: false, error: "track_id yok" };

  const res = await startTrack(token, song.spotify_track_id);
  if (!res.ok) return { started: false, error: res.error };

  await Promise.all([
    supabaseAdmin
      .from("now_playing")
      .update({
        song_id: nextItem.song_id,
        is_playing: true,
        progress_ms: 0,
        started_at: new Date().toISOString(),
      })
      .eq("venue_id", venueId),
    supabaseAdmin
      .from("queue")
      .update({ status: "playing" })
      .eq("id", nextItem.id),
  ]);

  return { started: true };
}

// state: lib/session.ts#signState ile imzalanmış değer (CSRF koruması)
export function getSpotifyAuthUrl(state: string): string {
  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-email",
    "playlist-read-private",
    "playlist-read-collaborative",
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: scopes,
    redirect_uri: REDIRECT_URI,
    state,
    // Spotify aksi halde tarayıcıdaki mevcut oturumu ekransız onaylıyor —
    // her mekan kendi hesabını seçebilsin diye onay ekranını zorla
    show_dialog: "true",
  });

  return `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!res.ok) throw new Error("Failed to exchange Spotify code for tokens");

  return res.json();
}

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  image_url: string | null;
  track_count: number;
  owner: string | null;
};

export async function getUserPlaylists(token: string): Promise<SpotifyPlaylistSummary[]> {
  const playlists: SpotifyPlaylistSummary[] = [];
  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      // 403: token playlist scope'larından önce alınmış — yeniden bağlanmak gerekir
      if (res.status === 403) {
        throw new Error("Playlist erişim izni yok — Spotify hesabını yeniden bağlayın");
      }
      throw new Error(`Spotify playlist listesi alınamadı (${res.status})`);
    }
    const data: {
      next: string | null;
      items?: Array<{
        id?: string;
        name?: string;
        images?: Array<{ url: string }>;
        // Eski API playlist şarkılarını "tracks" alanında, yenisi "items" alanında verir
        tracks?: { total?: number } | null;
        items?: { total?: number } | null;
        owner?: { display_name?: string };
      }>;
    } = await res.json();
    for (const p of data.items ?? []) {
      if (!p?.id) continue;
      playlists.push({
        id: p.id,
        name: p.name ?? "İsimsiz playlist",
        image_url: p.images?.[0]?.url ?? null,
        track_count: p.tracks?.total ?? p.items?.total ?? 0,
        owner: p.owner?.display_name ?? null,
      });
    }
    url = data.next;
  }

  return playlists;
}

export type SpotifyPlaylistTrack = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
};

export async function getPlaylistTracks(
  token: string,
  playlistId: string
): Promise<SpotifyPlaylistTrack[]> {
  type TrackObj = {
    id?: string;
    name?: string;
    duration_ms?: number;
    is_local?: boolean;
    type?: string;
    artists?: Array<{ name: string }>;
    album?: { images?: Array<{ url: string }> };
  } | null;

  const tracks: SpotifyPlaylistTrack[] = [];
  // Eski /tracks endpoint'i 403 dönüyor; güncel API /items kullanıyor
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;

  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Playlist şarkıları alınamadı (${res.status})`);
    const data: {
      next: string | null;
      // Girdiler eski API'de "track", yenisinde "item" alanında gelir
      items?: Array<{ track?: TrackObj; item?: TrackObj }>;
    } = await res.json();
    for (const entry of data.items ?? []) {
      const t = entry?.item ?? entry?.track;
      // Yerel dosyalar ve podcast bölümleri çalınamaz — atla
      if (!t?.id || t.is_local || t.type !== "track" || !t.duration_ms) continue;
      tracks.push({
        spotify_track_id: t.id,
        title: t.name ?? "",
        artist: (t.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
        album_cover_url: t.album?.images?.[0]?.url ?? "",
        duration_ms: t.duration_ms,
      });
    }
    url = data.next;
  }

  return tracks;
}

export type SpotifyTrackDetails = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_name: string;
  album_cover_url: string;
  duration_ms: number;
  popularity: number;
  release_date: string | null;
  external_url: string | null;
  preview_url: string | null;
};

export async function getTrackDetails(trackId: string): Promise<SpotifyTrackDetails | null> {
  const token = await getClientCredentialsToken();
  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}?market=TR`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spotify track bilgisi alınamadı (${res.status})`);

  const t: {
    id: string;
    name: string;
    duration_ms: number;
    popularity: number;
    preview_url: string | null;
    external_urls?: { spotify?: string };
    artists?: Array<{ name: string }>;
    album?: { name?: string; release_date?: string; images?: Array<{ url: string }> };
  } = await res.json();

  return {
    spotify_track_id: t.id,
    title: t.name ?? "",
    artist: (t.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
    album_name: t.album?.name ?? "",
    album_cover_url: t.album?.images?.[0]?.url ?? "",
    duration_ms: t.duration_ms,
    popularity: t.popularity ?? 0,
    release_date: t.album?.release_date ?? null,
    external_url: t.external_urls?.spotify ?? null,
    preview_url: t.preview_url ?? null,
  };
}

export async function getSpotifyProfile(accessToken: string): Promise<{
  id: string;
  display_name: string | null;
  email: string | null;
}> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Spotify profile");
  return res.json();
}
