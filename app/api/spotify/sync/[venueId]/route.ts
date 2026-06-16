import { NextRequest, NextResponse } from "next/server";
import { getVenueAccessToken, playNextFromQueue } from "@/lib/spotify";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVenueAccess } from "@/lib/session";
import { fillQueueToTen } from "@/lib/queue-fill";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  if (!requireVenueAccess(req, venueId)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  let token: string;
  try {
    token = await getVenueAccessToken(venueId);
  } catch {
    return NextResponse.json({ error: "Spotify bağlı değil" }, { status: 400 });
  }

  // Bizim kuyruğa göre şu an çalması gereken şarkı
  const { data: currentItem } = await supabaseAdmin
    .from("queue")
    .select("id, song_id, songs(spotify_track_id)")
    .eq("venue_id", venueId)
    .eq("status", "playing")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Önceki sync'in kaydettiği ilerleme (döngü tespiti için)
  const { data: np } = await supabaseAdmin
    .from("now_playing")
    .select("progress_ms, started_at")
    .eq("venue_id", venueId)
    .maybeSingle();

  // Spotify'dan güncel durumu al
  const spotifyRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
  });

  interface SpotifyPlayerState {
    is_playing: boolean;
    progress_ms: number;
    item: { id: string; name: string } | null;
  }

  let spotifyData: SpotifyPlayerState | null = null;
  if (spotifyRes.ok && spotifyRes.status !== 204 && spotifyRes.status !== 404) {
    spotifyData = await spotifyRes.json();
  }

  const item = spotifyData?.item ?? null;
  const playingNow = !!(spotifyData?.is_playing && item);
  const songRel = currentItem?.songs as unknown as
    | { spotify_track_id: string }
    | { spotify_track_id: string }[]
    | null
    | undefined;
  const expectedTrackId =
    (Array.isArray(songRel) ? songRel[0] : songRel)?.spotify_track_id ?? null;
  const progressMs = spotifyData?.progress_ms ?? 0;

  // Az önce biz başlattıysak Spotify durumu henüz yansıtmamış olabilir — bekle
  const justStarted =
    np?.started_at && Date.now() - new Date(np.started_at).getTime() < 7000;

  if (playingNow) {
    const sameTrack = expectedTrackId && item.id === expectedTrackId;
    // Repeat döngüsü: aynı şarkı ama ilerleme belirgin şekilde geri sarmış → şarkı bitti, başa döndü
    const looped =
      sameTrack && (np?.progress_ms ?? 0) > 10000 && progressMs + 3000 < (np?.progress_ms ?? 0);

    if (sameTrack && !looped) {
      // Kuyruktaki doğru şarkı çalıyor — sadece ilerlemeyi yansıt
      await supabaseAdmin
        .from("now_playing")
        .update({
          song_id: currentItem!.song_id,
          is_playing: true,
          progress_ms: progressMs,
          started_at: new Date(Date.now() - progressMs).toISOString(),
        })
        .eq("venue_id", venueId);
      return NextResponse.json({ is_playing: true, title: item.name });
    }

    if (justStarted && !looped) {
      return NextResponse.json({ is_playing: true, pending: true });
    }

    // Spotify rotadan çıktı (repeat, autoplay veya manuel çalma) ya da şarkı bitti.
    // Kuyrukta şarkı varsa siteyi esas al ve sıradakini zorla çal
    const { count } = await supabaseAdmin
      .from("queue")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("status", "queued");

    if ((count ?? 0) > 0 || currentItem) {
      const result = await playNextFromQueue(venueId, token);
      if (result.started) return NextResponse.json({ is_playing: true, autostarted: true });
      if (result.error) return NextResponse.json({ is_playing: true, error: result.error });
    }

    // Kuyruk tamamen boş — Spotify'da çalanı olduğu gibi yansıt
    const { data: song } = await supabaseAdmin
      .from("songs")
      .select("id")
      .eq("spotify_track_id", item.id)
      .maybeSingle();

    await supabaseAdmin
      .from("now_playing")
      .update({
        song_id: song?.id ?? null,
        is_playing: true,
        progress_ms: progressMs,
        started_at: new Date(Date.now() - progressMs).toISOString(),
      })
      .eq("venue_id", venueId);
    return NextResponse.json({ is_playing: true, title: item.name });
  }

  // Çalmıyor. Ortada duraklatılmışsa dokunma — admin pause'unu ezme
  const pausedMidTrack = item && !spotifyData?.is_playing && progressMs > 0;
  if (pausedMidTrack) {
    await supabaseAdmin
      .from("now_playing")
      .update({ is_playing: false, progress_ms: progressMs })
      .eq("venue_id", venueId);
    return NextResponse.json({ is_playing: false, paused: true });
  }

  if (justStarted) {
    return NextResponse.json({ is_playing: false, pending: true });
  }

  // Şarkı doğal olarak bitti ya da hiçbir şey çalmıyor — kuyruktan sıradakini başlat
  const result = await playNextFromQueue(venueId, token);
  if (result.started) return NextResponse.json({ is_playing: true, autostarted: true });
  if (result.queueEmpty) {
    fillQueueToTen(venueId).catch(() => {});
    return NextResponse.json({ is_playing: false, queued: 0 });
  }
  return NextResponse.json({ is_playing: false, error: result.error });
}
