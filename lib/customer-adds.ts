/**
 * "Mekan müşteri eklemelerini kapattı mı?" sorusunun tek kaynağı — sunucu ve
 * istemci aynı kuralı kullansın diye saf tutuldu (bkz. lib/player-status.ts).
 *
 * Mekan paneli kapanmaya yakın `now_playing.customer_adds_paused_at`'e o anı
 * yazar (0072). Kapatma süresiz değil: 12 saat sonra kendiliğinden düşer —
 * gece kapatıp ertesi akşam açmayı unutan mekan bütün gece satış kaçırmasın.
 * Kural /api/queue ve talep gönderme yolunda da uygulanır.
 */
export const CUSTOMER_ADDS_PAUSE_MAX_MS = 12 * 60 * 60 * 1000;

export function isCustomerAddsPaused(
  pausedAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!pausedAt) return false;
  const at = Date.parse(pausedAt);
  return Number.isFinite(at) && nowMs - at < CUSTOMER_ADDS_PAUSE_MAX_MS;
}
