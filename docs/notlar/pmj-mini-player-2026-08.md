---
name: pmj-mini-player-2026-08
description: "Player artık admin panelinin içinde yüzen mini kartta; ayrı sekme \"TV modu\" olarak kaldı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9b4e7b3c-e767-47c9-b27b-e4a8a37ece3d
  modified: 2026-08-14T16:57:40.825Z
---

14 Ağu 2026'da müzik çalma ayrı sekmeden panelin içine alındı. `components/admin/MiniPlayer.tsx`
(kuyruk panosundaki "ŞU AN ÇALIYOR" kartında, albüm kapağının yerinde; 144px) `AdminPanelShell` içinde mount ediliyor — **sayfa
bileşenine konmamalı**, yoksa Ayarlar/İstatistik'e geçince unmount olup müzik keser.
Aç/kapa düğmesi YOK — oynatıcı hep açık, mekanın tek yapması gereken ilk açılışta bir kez
"Başlat"a dokunmak (tarayıcı politikası). Alt barda yalnızca "TV modu" bağlantısı kaldı.

**Why:** Mekanlar ayrı player sekmesini kapatıyor/kaybediyordu, panel PWA olarak kurulunca
ikinci sekme büsbütün sorun oluyordu.

**How to apply:** Denenip ELENEN iki yol: yüzen kart (dolu panonun üstüne biniyor) ve panelin
altına şerit (çirkin + yer yiyor). Çalışan desen YUVA: `MiniPlayerSlot` boş bir kutu çizip yer
ayırır, kabuktaki `MiniPlayer` o dikdörtgene `position:fixed` ile hizalanır — iframe DOM'da hiç
taşınmadığı için şarkı baştan yüklenmez. Yuvasız sayfalarda (Ayarlar/İstatistik) ve dar ekranda
pano gizliyken sağ alt köşeye düşer. Küçük kutuda bilgi ekranları taşıyordu:
`YouTubePlayer` artık `compact` propu alıyor. Gizleme özelliği EKLEME — YouTube oynatıcının görünür
kalmasını şart koşuyor, minik iframe'de oynatma güvenilmez. `/admin/[venueId]/player`
sayfası TV modu olarak duruyor; iki oynatıcı çakışmasını YouTubePlayer'ın claim kilidi zaten
çözüyor, mini karttaki "TV modu" bağlantısı da tıklanınca kartı kapatıyor.
Bkz. [[pmj-player-offline-gate-2026-08]], [[pmj-admin-home-merge-2026-08]], [[pmj-admin-pwa-2026-08]].
