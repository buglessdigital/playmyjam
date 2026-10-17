// Kuyruğun değişmez kuralları — saf fonksiyonlar (importsuz), testi
// lib/queue-invariants.test.ts. Sunucu her şarkı geçişinde bunlara bakar;
// ihlal varsa çalmaz, onarır ve Sorunlar'a yazar (bkz. lib/queue.ts).

/**
 * Otomatik dolum satırı yalnızca ÇALAN listeden (queue_position dolu olan) gelir.
 * Kaynağı olmayan satır (katalog yedeği) her zaman geçerlidir. Çalan liste
 * kümesi boşsa kaynaklı her otomatik satır bayattır: liste raydan inmiş ama
 * kuyruktaki şarkıları kalmıştır.
 */
export function staleAutoRow(sourcePlaylistId: string | null, playingPlaylistIds: readonly string[]): boolean {
  if (!sourcePlaylistId) return false;
  return !playingPlaylistIds.includes(sourcePlaylistId);
}
