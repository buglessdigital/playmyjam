---
name: pmj-player-background-throttle-2026-08
description: "Player kesintilerinin teşhisi — arka plandaki pencerenin kısılması, worker bekçisi ve ?debug=1 kayıt paneli"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5c98bb53-15f0-44dd-b6e1-fdeb70fcf990
  modified: 2026-08-11T12:57:59.471Z
---

11 Ağu 2026: Mekanda "3-4 şarkıda bir müzik kesiliyor, sıradaki başlamıyor" şikâyeti.
İki ayrı sebep bulundu ve düzeltildi (948968d + ce2dc9f, ikisi de prod'da):

1. **Kendi yankısıyla yarışma:** `next` isteğinin sonucunu Supabase Realtime çoğu
   zaman HTTP yanıtından ÖNCE getiriyor; `now_playing` dinleyicisi bunu dış komut
   sanıp araya giriyordu (tampon deck boşa gidiyor, aynı video iki kez yükleniyor,
   çapraz geçiş kesiliyordu). Artık `advancingRef || fadingRef` iken bu güncelleme
   yok sayılıyor.
2. **Arka planda uyutulma (ASIL sebep):** Chrome, görünmeyen sayfanın ana iş
   parçacığındaki `setInterval`'ini kısıyor. **Teşhisin anahtarı:** kesintiden sonra
   player penceresine geçilince şarkının ANINDA başlaması — bu, `visibilitychange`
   kurtarıcısının çalıştığı, yani arada hiçbir bekçinin dönmediği anlamına gelir.
   Chrome'a uygulama olarak kurulan (PWA) pencerede görülüyor, önde tutulan normal
   sekmede görülmüyor. Çözüm: bekçi darbesi dedicated worker'a taşındı
   (`createTicker`, YouTubePlayer.tsx); `setInterval` yalnızca yedek.

**Teşhis aracı:** player'daki `plog()` her şarkı geçişini, YouTube durum değişimini,
takılma/kurtarma adımını, API hatasını, görünürlük/freeze/resume ve ağ kopmasını
konsola yazar. `/admin/{slug}/player?debug=1` ile aynı döküm ekranda panel olarak
görünür. Bekçi turları arası boşluk 20 sn'yi aşarsa "SEKME KISILDI/DONDU" satırı düşer
— kesinti tekrarlarsa ilk bakılacak yer burasıdır.

İlgili: [[pmj-crossfade-2026-08]], [[pmj-player-offline-gate-2026-08]]
