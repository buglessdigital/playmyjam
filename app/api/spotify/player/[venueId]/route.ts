import { NextRequest, NextResponse } from "next/server";
import { getVenueAccessToken, playNextFromQueue } from "@/lib/spotify";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVenueAccess } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  if (!requireVenueAccess(req, venueId)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { action } = await req.json();

  try {
    const token = await getVenueAccessToken(venueId);

    if (action === "next") {
      // Mevcut çalanı "played" yapıp kuyruktaki sıradakini başlatır
      const result = await playNextFromQueue(venueId, token);
      if (!result.started && result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "play" || action === "pause") {
      const endpoint = action === "play" ? "/me/player/play" : "/me/player/pause";
      const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());

      await supabaseAdmin
        .from("now_playing")
        .update({ is_playing: action === "play" })
        .eq("venue_id", venueId);

      return NextResponse.json({ success: true });
    }

    if (action === "previous") {
      const res = await fetch("https://api.spotify.com/v1/me/player/previous", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());

      // Başa sarma, sync'te "şarkı bitti, döngüye girdi" sanılmasın
      await supabaseAdmin
        .from("now_playing")
        .update({ progress_ms: 0, started_at: new Date().toISOString() })
        .eq("venue_id", venueId);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
