---
name: pmj-spotify-aktarim-2026-08
description: "Mekanın Spotify listelerini PMJ'ye taşıma yolu — aktarım hedefi YouTube Music olmalı, YouTube değil"
metadata: 
  node_type: memory
  type: project
  originSessionId: 559685f4-fbfa-42d5-bfb7-b7c91f9a1620
  modified: 2026-08-11T16:54:29.035Z
---

Mekan sahibinin Spotify playlist'lerini PMJ'ye almanın kararlaştırılan yolu (11 Ağu 2026):
Soundiiz/TuneMyMusic ile **hedef "YouTube Music" seçilerek** aktarılır, oluşan liste
herkese açık yapılır, URL mevcut playlist import'una yapıştırılır. Kullanıcı bu yolu
denedi ve eşleşme kalitesinin belirgin şekilde iyi olduğunu doğruladı.

**Why:** Hedef "YouTube" seçilince araçlar tüm YouTube'da metin araması yapıyor ve
cover/karaoke/nightcore/sped-up/8D/1-saatlik-loop yüklemelerini getiriyor; bunları elle
ayıklamak zaman alıcı. YouTube Music hedefinde arama müzik kataloğunun içinde kalıyor,
o yüklemeler havuzda yok. Eşleştirmeyi PMJ içinde yapmak ise kota nedeniyle imkansız:
`search.list` şarkı başına 100 birim, 100 şarkılık liste günlük kotanın tamamını yer
(bkz. [[pmj-youtube-quota-2026-07]]). Buna karşılık hazır bir YouTube listesini import
etmek ~4 birim (bkz. [[pmj-playlists-2026-08]], [[pmj-playlist-autosync-2026-08]]).

**How to apply:** Yeni mekan onboarding'inde bu talimatı ver. Kalan hatalı eşleşmeler için
planlanan ama HENÜZ YAPILMAMIŞ adım: import sonrası "şüpheli" işaretleme ekranı —
kanal `" - Topic"` ile bitiyorsa temiz say (resmi ses kanalı), aksi halde başlıkta
live/cover/karaoke/nightcore/sped up/8d/1 hour/full album kalıbı, 8 dk üstü süre veya
çok düşük izlenme varsa işaretle; ek kota gerektirmez, veri zaten `videos.list`'ten geliyor.
Daha keskin varyant: Spotify playlist'i Client Credentials ile bedava okuyup (ad, sanatçı,
duration_ms, ISRC) süre farkı > 5 sn olanları işaretlemek. YouTube Music'in resmi olmayan
iç arama ucu (ytmusicapi) kotasız çözüm olurdu ama kota başvurusu sürerken kullanılmayacak.

**21 Eyl 2026 — "şüpheli işaretleme ekranı" RAFA KALDIRILDI (kullanıcı kararı):** kodda Spotify entegrasyonu yok, aktarım YouTube Music hedefiyle zaten temiz geliyor. Mekanlardan yanlış sürüm (cover/karaoke/sped up) şikâyeti gelirse yeniden açılır; tasarım yukarıda duruyor.
