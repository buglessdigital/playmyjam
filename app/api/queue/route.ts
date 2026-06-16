import { NextRequest, NextResponse } from "next/server";
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const venue_id = typeof body?.venue_id === "string" ? body.venue_id : "";
  const song_id = typeof body?.song_id === "string" ? body.song_id : "";
  const priority = body?.priority === true;

  if (!venue_id || !song_id) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // 30 dk cooldown: aynı şarkı bu mekanda son 30 dk içinde çalındıysa reddedilir
  const cooldownSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentlyPlayed } = await supabaseAdmin
    .from("queue")
    .select("id")
    .eq("venue_id", venue_id)
    .eq("song_id", song_id)
    .eq("status", "played")
    .not("user_id", "is", null)
    .gte("played_at", cooldownSince)
    .limit(1)
    .maybeSingle();

  if (recentlyPlayed) {
    return NextResponse.json({ error: "Bu şarkı son 30 dakika içinde çalındı" }, { status: 429 });
  }

  // Şu an çalınan şarkı da engellenir
  const { data: nowPlayingItem } = await supabaseAdmin
    .from("queue")
    .select("id")
    .eq("venue_id", venue_id)
    .eq("song_id", song_id)
    .eq("status", "playing")
    .limit(1)
    .maybeSingle();

  if (nowPlayingItem) {
    return NextResponse.json({ error: "Bu şarkı şu an çalıyor" }, { status: 429 });
  }

  const tokens_spent = priority ? 2 : 1;

  // Atomik düşüm — bakiye yetersizse false döner (race condition'a kapalı)
  const { data: spent, error: spendError } = await supabaseAdmin.rpc("spend_tokens", {
    p_user_id: user.id,
    p_venue_id: venue_id,
    p_amount: tokens_spent,
  });

  if (spendError) {
    return NextResponse.json({ error: "Jeton işlemi başarısız" }, { status: 500 });
  }
  if (!spent) {
    return NextResponse.json({ error: "Yetersiz jeton" }, { status: 402 });
  }

  // Müşteri şarkıları arasında en son pozisyonu bul — auto-fill aralığını (≥9000) dışarıda bırak
  const { data: lastInQueue } = await supabaseAdmin
    .from("queue")
    .select("position")
    .eq("venue_id", venue_id)
    .eq("status", "queued")
    .not("user_id", "is", null)
    .lt("position", 9000)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (lastInQueue?.position ?? 0) + 1;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  // Şarkıyı kuyruğa ekle
  const { error: queueError } = await supabaseAdmin.from("queue").insert({
    venue_id,
    song_id,
    user_id: user.id,
    added_by: profile?.username ?? "Misafir",
    tokens_spent,
    priority,
    position: priority ? 0 : nextPosition,
    status: "queued",
  });

  if (queueError) {
    // Kuyruğa eklenemedi — düşülen jetonu iade et
    await supabaseAdmin.rpc("add_tokens", {
      p_user_id: user.id,
      p_venue_id: venue_id,
      p_amount: tokens_spent,
    });
    return NextResponse.json({ error: "Kuyruk hatası" }, { status: 500 });
  }

  // Müşteri şarkısı eklendi — auto-fill'i ayarla (10'u aştıysa kırp, eksiğe düştüyse doldur)
  fillQueueToTen(venue_id).catch(() => {});

  // Çalan şarkı yoksa ilk sıradakini otomatik başlat — Spotify hatası isteği düşürmesin
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

  return NextResponse.json({ ok: true });
}
