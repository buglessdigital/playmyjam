import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playNextFromQueue } from "@/lib/queue";
import { fillQueueToTen } from "@/lib/queue-fill";
import { hasVenueSession } from "@/lib/venue-auth-cookie";
import { isPlayerOnline } from "@/lib/player-status";

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

  // venue_id gövdeden geliyor; mekan çerezi slug ile adlandırıldığı için önce
  // slug'a çevrilip kullanıcının gerçekten o mekanda giriş yaptığı doğrulanır
  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("slug")
    .eq("id", venue_id)
    .maybeSingle();
  if (!venue || !hasVenueSession(req, venue.slug, userId)) {
    return NextResponse.json({ error: "Bu mekana giriş yapmalısın" }, { status: 403 });
  }

  // Oynatıcı kapalıyken ekleme yapılmaz: şarkı çalmayacağı için jeton boşa gider.
  // Tazelik eşiği müşteri arayüzüyle aynı (bkz. lib/player-status.ts).
  const { data: heartbeatRow } = await supabaseAdmin
    .from("now_playing")
    .select("last_heartbeat_at")
    .eq("venue_id", venue_id)
    .maybeSingle();
  if (!isPlayerOnline((heartbeatRow as { last_heartbeat_at: string | null } | null)?.last_heartbeat_at)) {
    return NextResponse.json(
      { error: "Mekanın oynatıcısı şu an kapalı — şarkı eklenemez", code: "player_offline" },
      { status: 409 }
    );
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
      case "already_queued":
        return NextResponse.json({ error: "Bu şarkı zaten sırada" }, { status: 429 });
      // Şarkının bulunduğu listeler müşteriye kapatılmış ya da şarkı gizlenmiş
      // olabilir (0040) — arayüz bunu zaten gizler, bu dal doğrudan API'ye
      // atılan istekleri karşılar
      case "not_available":
        return NextResponse.json({ error: "Bu şarkı şu an mekanın listesinde değil" }, { status: 409 });
      case "insufficient_tokens":
        return NextResponse.json({ error: "Yetersiz jeton" }, { status: 402 });
      default:
        return NextResponse.json({ error: "Kuyruk hatası" }, { status: 500 });
    }
  }

  // Yanıtı bloklamayan işler: auto-fill ve hiçbir şey çalmıyorsa kuyruğu başlatma.
  // now_playing güncellenince admin cihazındaki player Realtime ile videoyu yükler.
  after(async () => {
    await fillQueueToTen(venue_id).catch(() => {});
    try {
      const { data: np } = await supabaseAdmin
        .from("now_playing")
        .select("song_id, is_playing, progress_ms")
        .eq("venue_id", venue_id)
        .maybeSingle();

      // Ortada duraklatılmış şarkı varsa dokunma — admin pause'unu ezme
      const idle = !np?.song_id || (!np.is_playing && (np.progress_ms ?? 0) === 0);
      if (idle) {
        await playNextFromQueue(venue_id);
      }
    } catch {
      // Başlatma başarısız olsa bile şarkı kuyruğa eklendi — player açılınca devam eder
    }
  });

  // cost: öncelikli ücret kuyruğun anlık haline bağlı (0044) — istemci iyimser
  // düşümünü gerçekten kesilen tutarla eşitlesin diye geri veriliyor
  return NextResponse.json({ ok: true, cost: result?.cost });
}
