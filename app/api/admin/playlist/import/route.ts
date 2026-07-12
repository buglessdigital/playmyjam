import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/session";
import { getPlaylistItems, parsePlaylistId, YouTubeQuotaError } from "@/lib/youtube";

// Public YouTube playlist'indeki tüm şarkıları mekan playlist'ine toplu ekler.
// OAuth gerekmez — admin playlist URL'sini yapıştırır. { added, skipped } döner.
export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const playlistId = parsePlaylistId(typeof body?.playlist_url === "string" ? body.playlist_url : "");
  if (!playlistId) {
    return NextResponse.json({ error: "Geçersiz playlist bağlantısı" }, { status: 400 });
  }

  let tracks;
  try {
    tracks = await getPlaylistItems(playlistId);
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json(
      { error: "Playlist alınamadı — bağlantının herkese açık olduğundan emin olun" },
      { status: 400 }
    );
  }

  const rows = tracks.map((t) => ({
    youtube_video_id: t.youtube_video_id,
    title: t.title,
    artist: t.artist,
    album_cover_url: t.album_cover_url,
    duration_ms: t.duration_ms,
    channel_title: t.channel_title,
    view_count: t.view_count,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0 });
  }

  const { data: songRows, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(rows, { onConflict: "youtube_video_id" })
    .select("id");

  if (songErr || !songRows) {
    return NextResponse.json({ error: songErr?.message ?? "Şarkılar kaydedilemedi" }, { status: 500 });
  }

  const songIds = songRows.map((r) => r.id);
  const { data: existing } = await supabaseAdmin
    .from("venue_songs")
    .select("song_id")
    .eq("venue_id", session.venue_id)
    .in("song_id", songIds);

  const existingSet = new Set((existing ?? []).map((e) => e.song_id));
  const newRows = songIds
    .filter((id) => !existingSet.has(id))
    .map((song_id) => ({ venue_id: session.venue_id, song_id, play_count: 0, in_venue_list: true }));

  if (newRows.length > 0) {
    const { error: insErr } = await supabaseAdmin.from("venue_songs").insert(newRows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    revalidateTag(`venue-songs-${session.venue_id}`, "max");
  }

  return NextResponse.json({ added: newRows.length, skipped: songIds.length - newRows.length });
}
