import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseSongInput } from "@/lib/validate";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseSongInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("slug", venueId)
    .single();

  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  const { data: song, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(
      {
        spotify_track_id: parsed.song.spotify_track_id,
        title: parsed.song.title,
        artist: parsed.song.artist,
        album_cover_url: parsed.song.album_cover_url,
        duration_ms: parsed.song.duration_ms,
      },
      { onConflict: "spotify_track_id" }
    )
    .select("id")
    .single();

  if (songErr || !song) {
    return NextResponse.json({ error: "Şarkı kaydedilemedi" }, { status: 500 });
  }

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();

  const { error } = await supabaseAdmin.from("song_requests").insert({
    venue_id: venue.id,
    song_id: song.id,
    user_id: user.id,
    requested_by: profile?.username ?? user.email?.split("@")[0] ?? "Misafir",
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: "İstek gönderilemedi" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
