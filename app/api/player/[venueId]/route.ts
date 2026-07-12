import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVenueAccess } from "@/lib/session";
import { playNextFromQueue, markUnplayableAndSkip } from "@/lib/queue";

// Çalma motoru komutları. Spotify Connect'e uzaktan kumanda yerine yalnızca
// now_playing/queue güncellenir; admin cihazındaki gömülü player now_playing'i
// Realtime ile dinler ve değişikliği uygular.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  if (!requireVenueAccess(req, venueId)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;

  switch (action) {
    case "next": {
      const result = await playNextFromQueue(venueId);
      if (result.error) return NextResponse.json(result, { status: 500 });
      return NextResponse.json(result);
    }

    case "play":
    case "pause": {
      await supabaseAdmin
        .from("now_playing")
        .update({ is_playing: action === "play" })
        .eq("venue_id", venueId);
      return NextResponse.json({ ok: true });
    }

    // Player'ın onError'u: video embed'e kapalı/kaldırılmış/bölge engelli —
    // şarkıyı işaretle ve sıradakine geç
    case "error": {
      const videoId = typeof body?.video_id === "string" ? body.video_id : "";
      if (!videoId) return NextResponse.json({ error: "video_id gerekli" }, { status: 400 });
      const result = await markUnplayableAndSkip(venueId, videoId);
      return NextResponse.json(result);
    }

    // Player 15 sn'de bir ilerleme + sağlık sinyali yollar. started_at çapası
    // müşteri tarafındaki söz senkronu/ilerleme çubuğu için tazelenir.
    case "heartbeat": {
      const progressMs = typeof body?.progress_ms === "number" ? Math.floor(body.progress_ms) : 0;
      const isPlaying = body?.is_playing === true;
      await supabaseAdmin
        .from("now_playing")
        .update({
          progress_ms: Math.max(progressMs, 0),
          is_playing: isPlaying,
          last_heartbeat_at: new Date().toISOString(),
          ...(isPlaying ? { started_at: new Date(Date.now() - progressMs).toISOString() } : {}),
        })
        .eq("venue_id", venueId);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Geçersiz komut" }, { status: 400 });
  }
}
