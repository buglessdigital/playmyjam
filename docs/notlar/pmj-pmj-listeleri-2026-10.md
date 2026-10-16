---
name: pmj-pmj-listeleri-2026-10
description: "PMJ Listeleri (16 Eki 2026) — super admin Excel'den ortak liste kurar, mekan panelden açar; abonelik, otomatik çalmaya girmez; 0081 ŞART ve koddan ÖNCE"
metadata:
  type: project
---

**Ne:** PMJ'nin hazırladığı ortak listeler. Super admin `/super-admin/pmj-playlists`'ten Excel/CSV yükler (sütunlar: Playlist · Şarkı · Sanatçı · YouTube linki), önizlemede bulunamayanları link yapıştırarak düzeltir, kaydeder. Mekan panelinin sol rayındaki açılır "PMJ Listeleri" çubuğundan istediği listeyi göz düğmesiyle müşteriye açar.

**Kararlar (kullanıcı, 16 Eki):** abonelik (PMJ listesi güncellenince açan her mekanda güncellenir), otomatik çalmaya GİRMEZ, mekan türüne göre öneri yok. Hafif argo serbest; ağır küfürlüyü PMJ ayıklar.

**Nasıl çalışıyor:** mekan listeyi açınca kendi `playlists` tablosuna `pmj_playlist_id` dolu bir satır + şarkı üyelikleri yazılır → müşteri kataloğu, görünürlük (0040) ve katalog temizliği (0026) mevcut trigger'larla işler. Kapatınca satır silinir. Bağlı satır: `queue_position` hep null (rotasyona girmez), rayda görünmez (`useLibrary` süzer), API'de düzenlenemez (`assertVenuePlaylist`, `touchesPmjList`). Katalog yedeği `venue_songs.autoplay_ok`'a bakar (yalnız mekanın KENDİ listesindeki şarkılar true) — PMJ şarkıları otomatik çalmaz. Panelin "Tüm Şarkılar"ı da `autoplay_ok` ile süzülür.

**How to apply:**
1. **0081 ŞART ve koddan ÖNCE prod'a.** Kod `venue_songs.autoplay_ok` kolonunu okuyor; kolon yoksa katalog yedeği sorgusu hata verir, kuyrukta liste olmayan mekanda müzik susar.
2. Excel okuyucu bağımlılıksız (`lib/xlsx-read.ts`, Node zlib); .xls desteklenmez. HYPERLINK() ve hücre köprüsünün ADRESİ okunur.
3. Linkli satır: havuzda yoksa `videos.list` ile eklenir (50 = 1 birim), kategori kuralı YOK (seçilmiş liste). Linksiz satır `findInPool` (talep onayının eşleştirmesi) — yanlış sürüm seçebilir, önizlemede "ad ile bulundu" rozetiyle işaretli.
4. Aynı adla yeniden yükleme = içeriği değiştir (sıra Excel'deki sıra), abonelere senkron.

Bkz. [[pmj-playlist-customer-visibility-2026-08]], [[pmj-talep-onay-akisi-2026-08]], [[pmj-hedefli-hasat-2026-10]].
