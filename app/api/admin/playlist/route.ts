import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/session";
import { parseSongInput } from "@/lib/validate";
import { addSongToVenuePlaylist } from "@/lib/playlist";

export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseSongInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await addSongToVenuePlaylist(session.venue_id, parsed.song);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const venueSongId = typeof body?.venue_song_id === "string" ? body.venue_song_id : "";
  const inVenueList = body?.in_venue_list;
  if (!venueSongId || typeof inVenueList !== "boolean") {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("venue_songs")
    .update({ in_venue_list: inVenueList })
    .eq("id", venueSongId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const venueSongId = typeof body?.venue_song_id === "string" ? body.venue_song_id : "";
  if (!venueSongId) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("venue_songs")
    .delete()
    .eq("id", venueSongId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  return NextResponse.json({ ok: true });
}
