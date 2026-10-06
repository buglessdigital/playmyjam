---
name: pmj-crossfade-2026-08
description: "Player'da Spotify tarzı crossfade — iki YouTube deck'i (A/B), 0039 migration ŞART, mobilde kapalı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1998c7ed-171d-4938-97c5-13df1ebfcb19
  modified: 2026-08-08T14:08:06.022Z
---

8 Ağu 2026'da eklendi: çalan şarkının son N saniyesinde sıradaki şarkı başlar,
sesler eşit güç (sin/cos) rampasıyla çaprazlanır. Süre panelden (Ayarlar > Şarkı
Geçişi) 0-12 sn, varsayılan 4 sn; 0 = kapalı.

**Why:** Tek YT.Player ile crossfade imkânsız — iki şarkının aynı anda çalması
gerekiyor. Bu yüzden `YouTubePlayer.tsx` iki deck'e (A/B) çevrildi; "aktif deck"
kavramı eklendi ve heartbeat/ses bekçisi/realtime karşılaştırması hep aktif
deck'ten geçiyor.

**How to apply:**
- `supabase/migrations/0039_now_playing_crossfade.sql` (now_playing.crossfade_ms)
  kullanıcının SQL Editor'ında ÇALIŞTIRILMALI — yoksa panel "Geçiş süresi
  kaydedilemedi" der, player varsayılan 0 ile (kapalı) çalışır.
- Kuyruğu tüketmeyen `peek` action'ı (`lib/queue.ts:peekNextFromQueue`) önyükleme
  için; gerçek `next` geçiş fiilen başlarken atılır → now_playing/panel/started_at
  yeni şarkıya geçiş anında döner (30 dk cooldown çapası da o an başlar).
- Elle atlama (panel "sonraki") crossfade YAPMAZ, anında geçer.
- Mobil tarayıcıda (iPhone/iPad/Android UA) ve ses sapması tespit edilince
  (volumeIgnored) crossfade kapanır — setVolume etkisiz olduğu için iki şarkı tam
  sesle üst üste binerdi.
- Ses bekçisi (`enforceVolume`/`pushVolume`) geçiş sırasında kendini devre dışı
  bırakır; yoksa rampayı ezer. Bkz. [[pmj-volume-control-2026-08]].
- Kısa şarkılarda (süre < 2×fade + 5 sn) ve süresi bilinmeyen videolarda atlanır.

İlgili: [[pmj-playlist-queue-2026-08]], [[pmj-player-offline-gate-2026-08]]
