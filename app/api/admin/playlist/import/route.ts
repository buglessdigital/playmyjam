import { NextRequest, NextResponse } from "next/server";
import { updateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/session";
import { getVenueAccessToken, getPlaylistTracks } from "@/lib/spotify";

const PLAYLIST_ID_RE = /^[A-Za-z0-9]{10,40}$/;

// Spotify playlist'indeki tüm şarkıları mekan playlist'ine toplu ekler.
// Zaten ekli olanlar atlanır; sonuçta { added, skipped } döner.
export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id.trim() : "";
  if (!PLAYLIST_ID_RE.test(playlistId)) {
    return NextResponse.json({ error: "Geçersiz playlist kimliği" }, { status: 400 });
  }

  let tracks;
  try {
    const token = await getVenueAccessToken(session.venue_id);
    tracks = await getPlaylistTracks(token, playlistId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Playlist şarkıları alınamadı";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Aynı şarkı playlist'te birden çok kez olabilir — tek upsert'te çakışmasın
  const unique = [...new Map(tracks.map((t) => [t.spotify_track_id, t])).values()];
  if (unique.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0 });
  }

  const { data: songRows, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(unique, { onConflict: "spotify_track_id" })
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
    updateTag(`venue-songs-${session.venue_id}`);
  }

  return NextResponse.json({ added: newRows.length, skipped: songIds.length - newRows.length });
}
