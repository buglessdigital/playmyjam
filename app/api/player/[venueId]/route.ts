import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { renewAdminCookie, venueAccess } from "@/lib/admin-session";
import { playNextFromQueue, markUnplayableAndSkip } from "@/lib/queue";

// Sahiplik bu süre boyunca heartbeat gelmezse serbest kalır (heartbeat 15 sn'de bir).
// Panelin "oynatıcı çevrimdışı" eşiğiyle aynı: 45 sn.
const CLAIM_STALE_MS = 45_000;

type ClaimRow = { player_claim: string | null; player_claim_at: string | null };

// 0027 uygulanmadan kod deploy edilirse kilit sessizce devre dışı kalmalı —
// aksi halde claim kolonlarını yazmaya çalışan heartbeat komple düşer ve
// çalma durumu güncellenmez. İlk okumada anlaşılıp burada hatırlanır.
let claimSupported = true;

async function readClaim(venueId: string): Promise<ClaimRow | null> {
  if (!claimSupported) return null;
  const { data, error } = await supabaseAdmin
    .from("now_playing")
    .select("player_claim, player_claim_at")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) {
    console.error("[player] claim kolonları okunamadı, kilit devre dışı:", error.message);
    claimSupported = false;
    return null;
  }
  return (data as ClaimRow | null) ?? null;
}

function claimIsStale(row: ClaimRow): boolean {
  if (!row.player_claim) return true;
  if (!row.player_claim_at) return true;
  return Date.now() - Date.parse(row.player_claim_at) > CLAIM_STALE_MS;
}

// Bu istek mekanın çalma sahibinden mi geliyor? claim taşımayan istekler
// (admin panelindeki çal/duraklat/sonraki) her zaman geçer — ses üretmezler.
async function isOwner(venueId: string, claimId: string | null): Promise<boolean> {
  if (!claimId) return true;
  const row = await readClaim(venueId);
  if (!row) return true;
  return row.player_claim === claimId || claimIsStale(row);
}

// Çalma motoru komutları. Spotify Connect'e uzaktan kumanda yerine yalnızca
// now_playing/queue güncellenir; admin cihazındaki gömülü player now_playing'i
// Realtime ile dinler ve değişikliği uygular.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  const access = await venueAccess(req, venueId);
  if (!access) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  // Her istek oturumu tazeler: mekan ekranı günlerce açık kalsa da düşmez
  const reply = (body: unknown, init?: ResponseInit) =>
    renewAdminCookie(NextResponse.json(body, init), access);

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const claimId = typeof body?.claim_id === "string" ? body.claim_id : null;

  switch (action) {
    // Player açılışta sahiplik ister. Sahip yoksa/bayatsa ya da force verildiyse
    // devralır; aksi halde çağıran taraf "başka cihazda açık" uyarısı gösterir.
    case "claim": {
      if (!claimId) return reply({ error: "claim_id gerekli" }, { status: 400 });

      const row = await readClaim(venueId);
      if (!row) return reply({ ok: true, claimed: true }); // kilit yok (0027 öncesi)

      const mine = row.player_claim === claimId;
      if (!mine && !claimIsStale(row) && body?.force !== true) {
        return reply({ ok: false, taken: true });
      }

      await supabaseAdmin
        .from("now_playing")
        .update({ player_claim: claimId, player_claim_at: new Date().toISOString() })
        .eq("venue_id", venueId);
      return reply({ ok: true, claimed: true });
    }

    case "next": {
      if (!(await isOwner(venueId, claimId))) {
        return reply({ started: false, claim_lost: true }, { status: 409 });
      }
      const result = await playNextFromQueue(venueId);
      if (result.error) return reply(result, { status: 500 });
      return reply(result);
    }

    case "play":
    case "pause": {
      await supabaseAdmin
        .from("now_playing")
        .update({ is_playing: action === "play" })
        .eq("venue_id", venueId);
      return reply({ ok: true });
    }

    // Panelden ses seviyesi (0-100). Ses üretmeyen bir komut olduğu için claim
    // aranmaz; player değişikliği Realtime ile duyup YT.setVolume çağırır.
    case "volume": {
      const raw = typeof body?.volume === "number" ? body.volume : NaN;
      if (!Number.isFinite(raw)) return reply({ error: "volume gerekli" }, { status: 400 });
      const volume = Math.min(100, Math.max(0, Math.round(raw)));
      const { error } = await supabaseAdmin
        .from("now_playing")
        .update({ volume })
        .eq("venue_id", venueId);
      // 0036 uygulanmadan deploy edilirse kolon yoktur — panel bunu anlaşılır
      // bir uyarıya çevirsin diye hatayı yutmuyoruz
      if (error) {
        console.error("[player] ses seviyesi yazılamadı:", error.message);
        return reply({ error: "Ses seviyesi kaydedilemedi" }, { status: 500 });
      }
      return reply({ ok: true, volume });
    }

    // Player'ın onError'u: video embed'e kapalı/kaldırılmış/bölge engelli —
    // şarkıyı işaretle ve sıradakine geç
    case "error": {
      const videoId = typeof body?.video_id === "string" ? body.video_id : "";
      if (!videoId) return reply({ error: "video_id gerekli" }, { status: 400 });
      if (!(await isOwner(venueId, claimId))) {
        return reply({ started: false, claim_lost: true }, { status: 409 });
      }
      const result = await markUnplayableAndSkip(venueId, videoId);
      return reply(result);
    }

    // Player 15 sn'de bir ilerleme + sağlık sinyali yollar. started_at çapası
    // müşteri tarafındaki söz senkronu/ilerleme çubuğu için tazelenir.
    case "heartbeat": {
      const progressMs = typeof body?.progress_ms === "number" ? Math.floor(body.progress_ms) : 0;
      const isPlaying = body?.is_playing === true;
      const videoId = typeof body?.video_id === "string" ? body.video_id : null;

      // Sahip olmayan player susturulur: yanıttaki claim_lost ile kendini durdurur
      if (!(await isOwner(venueId, claimId))) {
        return reply({ ok: false, claim_lost: true }, { status: 409 });
      }

      // Kuyruk boşken gelen "buradayım" sinyali: çalma durumuna dokunmadan yalnızca
      // sağlık sinyalini tazeler. Müşteri paneli oynatıcının açık olduğunu bundan
      // anlar (bkz. lib/player-status.ts).
      if (body?.presence === true) {
        await supabaseAdmin
          .from("now_playing")
          .update({
            last_heartbeat_at: new Date().toISOString(),
            ...(claimId && claimSupported
              ? { player_claim: claimId, player_claim_at: new Date().toISOString() }
              : {}),
          })
          .eq("venue_id", venueId);
        return reply({ ok: true });
      }

      let update = supabaseAdmin
        .from("now_playing")
        .update({
          progress_ms: Math.max(progressMs, 0),
          is_playing: isPlaying,
          last_heartbeat_at: new Date().toISOString(),
          // Sahiplik canlı tutulur; player kapanınca 45 sn sonra serbest kalır
          ...(claimId && claimSupported
            ? { player_claim: claimId, player_claim_at: new Date().toISOString() }
            : {}),
          ...(isPlaying ? { started_at: new Date(Date.now() - progressMs).toISOString() } : {}),
        })
        .eq("venue_id", venueId);
      // Skip ile yarışan bayat heartbeat'e karşı koruma: player'ın raporladığı
      // video satırdakiyle eşleşmiyorsa (şarkı az önce değişti) yazma
      if (videoId) update = update.eq("video_id", videoId);
      await update;
      return reply({ ok: true });
    }

    default:
      return reply({ error: "Geçersiz komut" }, { status: 400 });
  }
}
