---
name: pmj-telefon-kumanda-modu-2026-08
description: "Telefonda admin paneli oynatıcı kurmaz, uzaktan kumandadır; karar lib/player-host.ts'te cihaz bazlı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 82191410-c76d-4c25-ab82-5d232f3c7ef6
  modified: 2026-08-17T12:59:31.149Z
---

17 Ağu 2026: mekan admin paneli telefonda artık oynatıcı KURMAZ — panel yalnızca
bilgisayarda çalan player'ın kumandasıdır. Karar `lib/player-host.ts`'te:
dokunmatik + ekran kısa kenarı < 600 px = telefon. Eşik bilerek dar, tabletler
(bir kısmı mekanlarda müziği çalıyor) eskisi gibi player kurar. Kullanıcı seçimi
localStorage `pmj:player-host` = on/off ile her iki yöne çevrilebilir; alt bardaki
"Bu cihazda çal" / "Kumanda moduna dön" düğmeleri bunu yazar.

**Why:** Sağ altta duran mini player küçük ekranın altını kaplayıp paneli
kullanılamaz hale getiriyordu; ayrıca telefonda kurulan player sahipliği kendine
alıp (409) bilgisayardaki müziği susturuyordu.

**How to apply:** Kumanda modunda `MiniPlayer` null döner, `MiniPlayerSlot`
video yuvası yerine albüm kapağı çizer, PlayerBar'da "TV modu" bağlantısı
GİZLENİR (o sayfa müziği telefona taşır). Kontroller (oynat/geç/ses) zaten
sunucudan geçtiği için değişmedi. Migration yok. Bkz. [[pmj-mini-player-2026-08]],
[[pmj-player-offline-gate-2026-08]].
