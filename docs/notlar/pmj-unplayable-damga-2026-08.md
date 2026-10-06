---
name: pmj-unplayable-damga-2026-08
description: "Çalınamaz damgası yalnızca YouTube 100/101/150'de vurulur; damgayı geri almak için snapshot'tan da silmek şart"
metadata: 
  node_type: memory
  type: project
  originSessionId: da15e4e1-9da1-42f1-bebe-1a3f0b706ad6
  modified: 2026-08-12T15:04:07.680Z
---

12 Ağu 2026'da düzeltildi (c887c38): player'ın `onError`'u HER YouTube hata
kodunda `embeddable=false` damgası vuruyordu. Damga kalıcıdır ve
`purgeUnplayableSong` ile şarkıyı playlist'lerden + mekan kataloglarından da
siler. Hata 2 (geçersiz parametre) ve 5 (HTML5 oynatıcı) geçici olabildiği için
prod'da damgalı 28 şarkının 11'i aslında oynatılabilirdi. Artık damga yalnızca
100/101/150'de vurulur; 2 ve 5'te 3 hak verilip damgasız atlanır. Filtre hem
istemcide (`FATAL_YT_ERROR_CODES`) hem route handler'da ikizdir.

**Why:** Damga tek yönlü bir yıkım — `playlist_songs` satırları hard delete
edilir, hangi mekanın neyi kaybettiği kayıtta kalmaz.

**How to apply:** Bir şarkının damgasını geri alırken `embeddable=true` YETMEZ.
Otomatik senkron yalnızca snapshot'ta OLMAYAN videoları ekler, silinen şarkı
snapshot'ta kaldığı için bir daha asla geri gelmez. `playlist_sources.snapshot_video_ids`
dizisinden de çıkarılmalı (+ `unchanged_streak = 0`); şarkı `songs` tablosunda
durduğu için geri ekleme 0 kota harcar. Playlist'e hiç bağlı olmayan (elle
eklenmiş) şarkılar bu yolla geri gelmez, mekanın elle eklemesi gerekir.
Bkz. [[pmj-playlist-autosync-2026-08]], [[pmj-player-background-throttle-2026-08]].
