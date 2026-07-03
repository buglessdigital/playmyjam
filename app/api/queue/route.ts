import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVenueAccessToken, startTrack } from "@/lib/spotify";
import { fillQueueToTen } from "@/lib/queue-fill";

async function isSpotifyPlaying(venueId: string): Promise<boolean> {
  try {
    const token = await getVenueAccessToken(venueId);
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok || res.status === 204) return false;
    const data = await res.json();
    return data?.is_playing === true && !!data?.item;
  } catch {
    return false;
  }
}

async function startPlayingOnSpotify(venueId: string, songId: string): Promise<void> {
  const { data: song } = await supabaseAdmin
    .from("songs")
    .select("spotify_track_id")
    .eq("id", songId)
    .single();
  if (!song?.spotify_track_id) return;

  const token = await getVenueAccessToken(venueId);
  const res = await startTrack(token, song.spotify_track_id);

  if (res.ok) {
    await supabaseAdmin
      .from("now_playing")
      .update({ song_id: songId, is_playing: true, progress_ms: 0, started_at: new Date().toISOString() })
      .eq("venue_id", venueId);
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  // getClaims: JWT'yi yerelde doğrular — Auth sunucusuna gitmez
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const venue_id = typeof body?.venue_id === "string" ? body.venue_id : "";
  const song_id = typeof body?.song_id === "string" ? body.song_id : "";
  const priority = body?.priority === true;

  if (!venue_id || !song_id) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // Cooldown + çalıyor kontrolü + jeton düşümü + pozisyon + insert tek transaction (0005)
  const { data: result, error } = await supabaseAdmin.rpc("request_song", {
    p_user_id: userId,
    p_venue_id: venue_id,
    p_song_id: song_id,
    p_priority: priority,
  });

  if (error) {
    return NextResponse.json({ error: "Kuyruk hatası" }, { status: 500 });
  }

  if (!result?.ok) {
    switch (result?.error) {
      case "cooldown":
        return NextResponse.json({ error: "Bu şarkı son 30 dakika içinde çalındı" }, { status: 429 });
      case "playing":
        return NextResponse.json({ error: "Bu şarkı şu an çalıyor" }, { status: 429 });
      case "insufficient_tokens":
        return NextResponse.json({ error: "Yetersiz jeton" }, { status: 402 });
      default:
        return NextResponse.json({ error: "Kuyruk hatası" }, { status: 500 });
    }
  }

  // Yanıtı bloklamayan işler: auto-fill ayarı ve gerekiyorsa Spotify'da başlatma.
  // Kullanıcı arayüzü realtime aboneliğiyle zaten güncelleniyor.
  after(async () => {
    await fillQueueToTen(venue_id).catch(() => {});
    try {
      const playing = await isSpotifyPlaying(venue_id);
      if (!playing) {
        await startPlayingOnSpotify(venue_id, song_id);
        await supabaseAdmin
          .from("queue")
          .update({ status: "playing" })
          .eq("venue_id", venue_id)
          .eq("song_id", song_id)
          .eq("status", "queued");
      }
    } catch {
      // Spotify erişilemese bile şarkı kuyruğa eklendi — sync süreci telafi eder
    }
  });

  return NextResponse.json({ ok: true });
}
