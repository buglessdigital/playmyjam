---
name: pmj-volume-control-2026-08
description: "Panelden uzaktan ses kontrolü — now_playing.volume (0036 ŞART), player Realtime ile YT.setVolume çağırır"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d2fc67b-8de2-4c86-884c-d250b7197575
  modified: 2026-08-07T02:50:13.088Z
---

7 Ağu 2026'da eklendi: mekan panelindeki "Şu An Çalıyor" kartında ses kaydırıcısı
(0-100) + sessize alma. Komut yolu play/pause ile aynı — panel `/api/player/[venueId]`
`action: "volume"` yazar, `now_playing.volume` güncellenir, [[pmj-player-offline-gate-2026-08]]
ile aynı Realtime kanalından player duyup `YT.setVolume` çağırır.

**Why:** Ses yalnızca player'ın açık olduğu cihazdan ayarlanabiliyordu; barın
arkasından değiştirilemiyordu. Ayrı mute kolonu YOK — sessize alma paneldeki
düğmenin eski değeri hatırlayıp 0 yazmasıyla olur (tek kaynak).

**How to apply:** `supabase/migrations/0036_now_playing_volume.sql` kullanıcının
SQL Editor'ından ŞART; kolon yoksa hem panel hem player kolonsuz select'e düşer
(sessiz devre dışı). iOS'ta `setVolume` yok sayılır — panelde bu uyarı yazıyor.

7 Ağu 2026 düzeltmesi ("kısılan ses kendiliğinden geri açılıyordu"): yazma yolu
sorunsuzdu (DB'de değer duruyordu), player tarafı geri kaçıyordu. `YouTubePlayer`'a
`pushVolume` + `enforceVolume` bekçisi eklendi — 3 sn'de bir `getVolume()/isMuted()`
okunup sapma varsa geri yazılıyor, 0 için `setVolume(0)` yanına `mute()` de basılıyor
(bazı cihazlar setVolume(0)'ı yok sayıyor, mute'u sayıyor). Üst üste 3 sapmada
player ekranında "bu cihaz uzaktan ses ayarını kabul etmiyor" uyarısı çıkar —
mobil cihaz teşhisi artık gözle görülüyor.
