import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/session";
import { addSongToVenuePlaylist } from "@/lib/playlist";

export async function PATCH(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requestId = typeof body?.request_id === "string" ? body.request_id : "";
  const status = body?.status;
  if (!requestId || (status !== "accepted" && status !== "rejected")) {
    return NextResponse.json({ error: "Eksik veya geçersiz alan" }, { status: 400 });
  }

  const { data: request } = await supabaseAdmin
    .from("song_requests")
    .select("id, status, songs(spotify_track_id, title, artist, album_cover_url, duration_ms)")
    .eq("id", requestId)
    .eq("venue_id", session.venue_id)
    .single();

  if (!request) {
    return NextResponse.json({ error: "İstek bulunamadı" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "İstek zaten sonuçlandırılmış" }, { status: 409 });
  }

  // Kabul edilirse şarkıyı mekan playlist'ine ekle (zaten varsa sorun değil)
  if (status === "accepted") {
    const songRel = request.songs as unknown as
      | { spotify_track_id: string; title: string; artist: string; album_cover_url: string | null; duration_ms: number }
      | { spotify_track_id: string; title: string; artist: string; album_cover_url: string | null; duration_ms: number }[]
      | null;
    const song = Array.isArray(songRel) ? songRel[0] : songRel;
    if (song?.spotify_track_id) {
      const result = await addSongToVenuePlaylist(session.venue_id, {
        spotify_track_id: song.spotify_track_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url ?? "",
        duration_ms: song.duration_ms,
      });
      if ("error" in result && result.status !== 409) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
    }
  }

  const { error } = await supabaseAdmin
    .from("song_requests")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
