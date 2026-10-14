// Ödeme mutabakatının saf karar katmanı (bkz. lib/payment-reconcile.ts).
// Dış bağımlılık yok: lib/payment-decision.test.ts `npm test` ile koşar.
import type { PaymentDetailResult } from "./iyzico.ts";

/** iyzico'da bu siparişe ait ödeme kaydı yok: form açılıp ödeme başlatılmadan kapatılmış */
export const IYZICO_NO_PAYMENT_RECORD = "5087";

/** Ödeme formu ve 3D Secure oturumu bu süreden çok önce kapanır */
export const ABANDON_AFTER_MS = 60 * 60_000;

export type ReconcileDecision = "confirm" | "mismatch" | "fail" | "abandon" | "wait" | "unknown";

/** Saf karar: iyzico yanıtı + sipariş yaşı → ne yapılacak (lib/payment-decision.test.ts) */
export function decide(
  order: { id: string; total: number | string },
  result: PaymentDetailResult,
  ageMs: number
): ReconcileDecision {
  if (result.status === "success" && result.paymentStatus === "SUCCESS") {
    // Para çekilmiş. Yine de kör yüklenmez: sepet bu sipariş, tutar bu tutar olmalı
    const sameBasket = !result.basketId || result.basketId === order.id;
    const sameAmount = Number(result.paidPrice) === Number(order.total);
    return sameBasket && sameAmount ? "confirm" : "mismatch";
  }
  if (result.paymentStatus === "FAILURE") return "fail";
  if (result.errorCode === IYZICO_NO_PAYMENT_RECORD || result.paymentStatus === "INIT_THREEDS") {
    return ageMs < ABANDON_AFTER_MS ? "wait" : "abandon";
  }
  return "unknown";
}
