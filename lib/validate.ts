export interface SongInput {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
}

const TRACK_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export function parseSongInput(
  body: unknown
): { ok: true; song: SongInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek" };
  }
  const b = body as Record<string, unknown>;

  const spotify_track_id = typeof b.spotify_track_id === "string" ? b.spotify_track_id.trim() : "";
  if (!TRACK_ID_RE.test(spotify_track_id)) {
    return { ok: false, error: "Geçersiz Spotify şarkı kimliği" };
  }

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > 300) {
    return { ok: false, error: "Şarkı adı gerekli (en fazla 300 karakter)" };
  }

  const artist = typeof b.artist === "string" ? b.artist.trim() : "";
  if (!artist || artist.length > 300) {
    return { ok: false, error: "Sanatçı adı gerekli (en fazla 300 karakter)" };
  }

  const album_cover_url = typeof b.album_cover_url === "string" ? b.album_cover_url.trim() : "";
  if (album_cover_url && (album_cover_url.length > 600 || !album_cover_url.startsWith("https://"))) {
    return { ok: false, error: "Geçersiz albüm kapağı adresi" };
  }

  const duration_ms = typeof b.duration_ms === "number" ? Math.floor(b.duration_ms) : NaN;
  if (!Number.isFinite(duration_ms) || duration_ms < 1000 || duration_ms > 3_600_000) {
    return { ok: false, error: "Geçersiz şarkı süresi" };
  }

  return { ok: true, song: { spotify_track_id, title, artist, album_cover_url, duration_ms } };
}
