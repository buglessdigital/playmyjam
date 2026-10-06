---
name: pmj-playlists-2026-08
description: "Mekan playlist'leri — otomatik çalma havuzu (aktif playlist'ler) müşteri katalogundan ayrıldı; 0026 migration şart"
metadata: 
  node_type: memory
  type: project
  originSessionId: faae3ffe-046e-463d-9f14-acd77f369b22
  modified: 2026-08-02T12:34:24.202Z
---

2 Ağustos 2026'da mekan admin paneline çoklu playlist eklendi. Otomatik çalma
havuzu ile müşteri katalogu artık ayrı: **auto-fill yalnızca `is_active` playlist'lerin
birleşiminden seçer**, müşteri ise eskisi gibi `venue_songs`'un tamamından seçer.

Kullanıcının netleştirdiği kurallar:
- Aynı anda birden fazla playlist aktif olabilir (havuz = birleşim).
- Bir şarkı birden fazla playlist'te olabilir (`playlist_songs` çoklu üyelik).
- Aktiflik değişince kuyruktaki **otomatik** şarkılar silinip yeniden doldurulur
  (`resetAutoQueue`); müşterinin jetonla eklediklerine ve sahnedekine dokunulmaz.
- Şarkı hiçbir playlist'te kalmayınca katalogdan düşer — 0026'daki
  `playlist_songs_prune_orphans` trigger'ı garanti eder.
- Hiç aktif playlist yoksa müzik susmasın diye tüm kataloga düşülür.

`venue_songs.in_venue_list` artık "müşteride görünür / gizli" anlamında (UI'da
Görünür/Gizli); gizli şarkı otomatik de çalmaz.

0026 uygulandı ve uçtan uca test edildi (izole test mekanı + gerçek API'ler, 2 Ağu
2026): playlist CRUD, çoklu üyelik, aktiflik değişiminde kuyruk tazeleme, prune
trigger, YouTube import (yeni/mevcut liste), müşterinin pasif listeden şarkı
isteyebilmesi. Test verisi silindi. Prod'da taner mekanı 3 listeye ayrılmış durumda.

**0026_venue_playlists.sql uygulanmadan kod deploy edilmemeli** — `venue_songs`
üzerine `(venue_id, song_id)` unique index ekliyor ve şarkı ekleme akışları bu
index'e (upsert onConflict) dayanıyor. DDL her zaman kullanıcının Supabase SQL
Editor'ından uygulanır (bkz. [[pmj-perf-rework-2026-07]]).

İlgili: [[pmj-playing-cooldown-2026-08]], [[pmj-saatli-playlist-fikri]] (zamanlanmış
otomatik geçiş hâlâ ertelenmiş durumda — buradaki geçiş elle yapılıyor).
