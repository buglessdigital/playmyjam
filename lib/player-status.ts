/**
 * "Mekanın oynatıcısı açık mı?" sorusunun tek kaynağı — sunucu ve istemci aynı
 * eşiği kullansın diye saf tutuldu (React kancası için bkz. lib/use-player-online.ts).
 *
 * Player 15 sn'de bir heartbeat yazar (şarkı çalmıyorken de: bkz. YouTubePlayer'ın
 * presence heartbeat'i). Bunun ~3 katı sessizlik "çevrimdışı" sayılır — admin
 * panelindeki uyarı eşiğiyle ve /api/player'daki claim eşiğiyle aynı.
 *
 * Player kapalıyken müşteri tarafı süre/ilerleme göstermez (veriler donmuş,
 * yanıltıcı olur) ve şarkı eklenmesine izin verilmez (şarkı çalmayacağı için
 * jeton boşa gider — kural /api/queue içinde de uygulanır).
 */
export const PLAYER_OFFLINE_AFTER_MS = 45_000;

export function isPlayerOnline(
  lastHeartbeatAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!lastHeartbeatAt) return false;
  const beat = Date.parse(lastHeartbeatAt);
  return Number.isFinite(beat) && nowMs - beat <= PLAYER_OFFLINE_AFTER_MS;
}
