export interface SongInput {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
}

// YouTube video kimliği 11 karakterdir (base64url alfabesi)
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseSongInput(
  body: unknown
): { ok: true; song: SongInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek" };
  }
  const b = body as Record<string, unknown>;

  const youtube_video_id = typeof b.youtube_video_id === "string" ? b.youtube_video_id.trim() : "";
  if (!VIDEO_ID_RE.test(youtube_video_id)) {
    return { ok: false, error: "Geçersiz YouTube video kimliği" };
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
    return { ok: false, error: "Geçersiz kapak görseli adresi" };
  }

  const duration_ms = typeof b.duration_ms === "number" ? Math.floor(b.duration_ms) : NaN;
  if (!Number.isFinite(duration_ms) || duration_ms < 1000 || duration_ms > 3_600_000) {
    return { ok: false, error: "Geçersiz şarkı süresi" };
  }

  return { ok: true, song: { youtube_video_id, title, artist, album_cover_url, duration_ms } };
}
