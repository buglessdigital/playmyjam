import { supabaseAdmin } from "@/lib/supabase/admin";
import { retrievePaymentByOrderId, type PaymentDetailResult } from "@/lib/iyzico";
import { decide } from "@/lib/payment-decision";
import { reportIssue } from "@/lib/ops-log";
import { sendPushToUser } from "@/lib/push";

// Ödeme mutabakatı: iyzico dönüşü (callback) hiç gelmeyen siparişleri iyzico'ya
// sipariş kimliğiyle sorar.
//
// Neden gerekli: jeton yalnızca müşterinin tarayıcısı iyzico'dan
// /api/payments/iyzico/callback'e dönünce yükleniyordu. Ödeme tamamlanıp dönüş
// sayfası yüklenmeden telefon kapanır, bağlantı kopar ya da uygulama arka plana
// düşerse para çekilir ama sipariş sonsuza dek "pending" kalırdı.
//
// 15 Eki 2026 taraması (47 bekleyen sipariş): 37'sinde iyzico'da ödeme kaydı yok
// (form açılıp kapatılmış), 7'si 3D Secure'da yarıda kalmış, 2'si bankadan
// dönmüş — kayıp para yok, ama mekanlar açılınca bu şansa bırakılmamalı.
//
// Karar tablosu (iyzico /payment/detail yanıtı):
//   SUCCESS              → jeton yüklenir (confirm_payment_order tekrar
//                          çağrılmaya dayanıklı: callback ile yarışsa da bir kez)
//   FAILURE              → sipariş failed
//   5087 / INIT_THREEDS  → 1 saati geçtiyse yarıda bırakılmış sayılır, failed
//   diğer / ağ hatası    → dokunulmaz, sonraki turda yeniden denenir
// (karar lib/payment-decision.ts'te, testli)

/** Callback normalde saniyeler içinde gelir — bundan genç siparişe dokunulmaz */
const MIN_AGE_MS = 15 * 60_000;
/** Bundan eski bekleyenler taranmaz (0017 öncesi deneme satırları vs.) */
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
/** Tur başına sorgu: iyzico'ya ardışık, her biri ~100 ms */
const BATCH = 40;

type PendingOrder = {
  id: string;
  user_id: string | null;
  venue_id: string | null;
  tokens: number;
  total: number | string;
  created_at: string;
};

export type ReconcileSummary = {
  checked: number;
  recovered: number;
  failed: number;
  abandoned: number;
  waiting: number;
  errors: number;
};

export async function reconcilePendingPayments(now = Date.now()): Promise<ReconcileSummary> {
  const { data, error } = await supabaseAdmin
    .from("payment_orders")
    .select("id, user_id, venue_id, tokens, total, created_at")
    .eq("status", "pending")
    .lte("created_at", new Date(now - MIN_AGE_MS).toISOString())
    .gte("created_at", new Date(now - MAX_AGE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`bekleyen siparişler okunamadı: ${error.message}`);

  const summary: ReconcileSummary = { checked: 0, recovered: 0, failed: 0, abandoned: 0, waiting: 0, errors: 0 };

  for (const order of (data ?? []) as PendingOrder[]) {
    summary.checked += 1;
    let result: PaymentDetailResult;
    try {
      result = await retrievePaymentByOrderId(order.id);
    } catch {
      summary.errors += 1;
      continue;
    }

    const outcome = await settle(order, result, now);
    summary[outcome] += 1;
  }

  if (summary.errors > 0) {
    await reportIssue({
      area: "payment",
      kind: "reconcile_errors",
      severity: "warn",
      message: `Ödeme mutabakatında ${summary.errors} sipariş iyzico'ya sorulamadı — sonraki turda yeniden denenecek`,
      detail: summary,
    });
  }
  return summary;
}

async function settle(
  order: PendingOrder,
  result: PaymentDetailResult,
  now: number
): Promise<"recovered" | "failed" | "abandoned" | "waiting" | "errors"> {
  const decision = decide(order, result, now - new Date(order.created_at).getTime());

  switch (decision) {
    case "mismatch":
      await reportIssue({
        area: "payment",
        kind: "reconcile_mismatch",
        severity: "error",
        message: `Mutabakat: iyzico'daki ödeme siparişle uyuşmuyor (${result.paidPrice} TL ≠ ${order.total} TL) — sipariş ${order.id} elle kontrol edilmeli`,
        venueId: order.venue_id,
        detail: { order_id: order.id, payment_id: result.paymentId, basket_id: result.basketId },
      });
      return "errors";

    case "fail":
      await closeOrder(order.id, result);
      return "failed";

    case "abandon":
      await closeOrder(order.id, { reconcile: "abandoned", iyzico: result });
      return "abandoned";

    case "wait":
      return "waiting";

    case "unknown":
      // Tanımadığımız bir yanıt: dokunma, kayıt düş
      await reportIssue({
        area: "payment",
        kind: "reconcile_unknown",
        severity: "warn",
        message: `Mutabakat: iyzico yanıtı tanınmadı (${result.errorCode ?? result.paymentStatus ?? result.status}) — sipariş ${order.id} bekletiliyor`,
        venueId: order.venue_id,
        detail: { order_id: order.id, status: result.status, payment_status: result.paymentStatus, error_code: result.errorCode, error_message: result.errorMessage },
      });
      return "errors";
  }

  const { data: confirmed, error } = await supabaseAdmin.rpc("confirm_payment_order", {
    p_order_id: order.id,
    p_iyzico_payment_id: result.paymentId ?? null,
    p_raw: { ...result, reconciled_at: new Date(now).toISOString() },
  });
  if (error) {
    await reportIssue({
      area: "payment",
      kind: "confirm_failed",
      severity: "error",
      message: `Ödeme alındı ama jeton yüklenemedi (mutabakat) — sipariş ${order.id} elle kontrol edilmeli`,
      venueId: order.venue_id,
      detail: { order_id: order.id, payment_id: result.paymentId, user_id: order.user_id },
      error,
    });
    return "errors";
  }
  // false: bu arada callback yetişip siparişi kapatmış — jeton zaten yüklendi
  if (!confirmed) return "waiting";

  await reportIssue({
    area: "payment",
    kind: "payment_recovered",
    severity: "warn",
    message: `iyzico dönüşü gelmemişti — ${order.tokens} jeton mutabakatla yüklendi (sipariş ${order.id})`,
    venueId: order.venue_id,
    detail: { order_id: order.id, payment_id: result.paymentId, user_id: order.user_id },
  });
  await notifyRecovered(order);
  return "recovered";
}

async function closeOrder(orderId: string, raw: unknown) {
  await supabaseAdmin
    .from("payment_orders")
    .update({ status: "failed", raw_response: raw, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending");
}

// Müşteri ödeme ekranından "başarısız" ya da hiçbir şey görmeden ayrılmış
// olabilir — jetonun geldiğini bilsin
async function notifyRecovered(order: PendingOrder) {
  if (!order.user_id) return;
  let url = "/";
  if (order.venue_id) {
    const { data: venue } = await supabaseAdmin.from("venues").select("slug").eq("id", order.venue_id).maybeSingle();
    if (venue?.slug) url = `/venue/${venue.slug}/tokens`;
  }
  await sendPushToUser(
    order.user_id,
    {
      title: "Jetonların yüklendi",
      body: `Ödemen alınmıştı, ${order.tokens} jeton hesabına eklendi. Gecikme için kusura bakma!`,
      url,
      tag: `payment-${order.id}`,
    },
    { kind: "payment_recovered", venueId: order.venue_id }
  ).catch(() => {});
}
