// Öncelikli istek ücretinin dinamik hesabı — SQL karşılığı public.priority_cost_now
// (bkz. supabase/migrations/0044_dynamic_priority_cost.sql). İkisi aynı formülü
// uygulamak zorunda: burası ekranda gösterilen fiyat, oradaki kesilen fiyat.

/** Kaç bekleyen normal şarkıda bir, öncelikli ücret 1 jeton artar. */
export const PRIORITY_STEP_SONGS = 3;

/**
 * Mekanın taban öncelikli ücreti + her `PRIORITY_STEP_SONGS` bekleyen normal
 * şarkı için 1 jeton. Üst sınır yok.
 */
export function priorityCostFor(baseCost: number, normalQueued: number): number {
  return baseCost + Math.floor(Math.max(0, normalQueued) / PRIORITY_STEP_SONGS);
}

/**
 * Sayıma giren satırlar: müşterinin jetonla NORMAL seçenekle eklediği, hâlâ
 * bekleyen şarkılar. RPC'lerin döndürdüğü queue_entries zaten yalnızca müşteri
 * satırlarını içeriyor (user_id not null), burada öncelikliler ayıklanıyor.
 */
export function normalQueuedCount(entries: { priority: boolean }[]): number {
  return entries.reduce((n, e) => (e.priority ? n : n + 1), 0);
}
