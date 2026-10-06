---
name: pmj-katalog-hasadi-2026-09
description: "Katalog hasadı — havuz 23.688 -> ~778 bin (22 Eyl); Topic neredeyse bitti; elle tur artık EN FAZLA --budget 3500 (cronlar kota istiyor)"
metadata:
  type: project
---

4 Eyl 2026: katalog büyütmenin darboğazının YouTube kotası değil **elle playlist bağlantısı toplamak** olduğu ölçüldü — o güne kadarki 23.688 şarkı toplam ~1.000 birime mal olmuştu, günlük kota 10.000. Çözüm `scripts/seed-catalog.ts --harvest`: `videos.list` yanıtındaki `snippet.channelId` artık `songs.channel_id`'ye yazılıyor (0049 migration), kanal kimliği `UCxxx → UUxxx` string dönüşümüyle yükleme listesine çevriliyor (sıfır kota) ve o liste okunuyor. Varsayılan yalnızca "Sanatçı - Topic" kanalları; `--harvest-any` her kanalı alır.

**Why:** "Sanatçı - Topic" kanalının yüklemeleri o sanatçının TÜM resmi diskografisi demek — kategori 10, gömülebilir, temiz başlık. Ölçüm: The Weeknd - Topic = 967 şarkı / ~20 birim. Havuzda 8.689 farklı sanatçı olduğu için mekanizma kendi kendini besliyor: yeni şarkı → yeni kanal → yeni şarkı.

**Durum (6 Eyl 2026):** havuz 23.688 -> 265.257 şarkı, 10.828 sanatçı. Topic kanallarının 441/1463'ü işlendi; kanal başına ~23 birim, kalan ~23.000 birim = günde bir 9.000'lik turla 2-3 gün. Devam komutu: `node scripts/seed-catalog.ts --harvest`. Topic modu YENİ Topic kanalı getirmiyor (aynı kanalların içini dolduruyor) — 1463 bitince büyüme durur, sonrası `--harvest-any` veya yeni tohum bağlantıları.

**19 Eyl 2026:** havuz yeni projede (quvkscvbsplxkuolvhwe) 265.279 şarkı; Supabase MCP bu projeye ERİŞEMEZ — sayım `psql "$NEW_DB_URL"` (.env.new) ile. Betik .env.local üzerinden zaten yeni projeye yazıyor. 5. tur 441/1463'ten devam ettirildi.

**19 Eyl 2026 (yeni çıkanlar):** hasat elle çalışan bir betik; yeni çıkan şarkılar havuza KENDİLİĞİNDEN girmez (Sena Şener "Alışılır Mı Aşka" 1 hafta sonra hâlâ yoktu, çünkü sanatçının resmi kanalı havuzda değildi, yalnızca Topic kanalı vardı). Tek kanal için: `npm run seed:catalog -- --playlist UU<kanal>`. O gün `--playlist` artık dosyayı okumuyor, `--force` da state dosyasını silmiyor (ikisi de önceden kota yakıyor/state'i siliyordu).

**22 Eyl 2026 — BÜTÇE KURALI:** elle hasat turunu artık `--budget 3500` ile çalıştır, varsayılan 9.000 ile DEĞİL. Aynı günlük kotayı (10.000, 07:00 UTC sıfırlanır) catalog-new cron'u (≤3.000, 06:00 UTC), youtube-refresh/metadata tazeleme (≤1.500, 03:00 UTC — YouTube 30 gün uyum kuralı) ve playlist senkronu (~1.010) paylaşıyor; ikisi de kota gününün SONUNDA koşuyor, yani sabah 9.000'lik tur onları aç bırakır. Havuz 777.566 şarkı / 10.855 sanatçı; Topic 1.415/1.485 bitmişti.

**How to apply:** (1) 0049 kolon bazlı `grant select/insert/update (channel_id)` içerir — `songs`'ta izinler kolon kolon verilmiş, yeni kolon miras ALMAZ, grant unutulursa service_role yazamaz (bkz [[pmj-playlist-rotation-2026-08]] aynı tuzak `venues`'ta). (2) Bulunamayan/süzgece takılan videolar `channel_id='-'` nişanıyla işaretlenir, yoksa geri doldurma hiç bitmez. (3) `playlists.list` UU kimliklerini kabul ediyor, yani `.seed-state.json` atlama optimizasyonu hasat listelerinde de çalışıyor. (4) Betiği `| head` ile borulama — çıktı görünmüyor, doğrudan dosyaya yönlendir. (5) YouTube uyum incelemesi sürerken HTML kazımaya girme; bu yol tamamen resmi API. (6) Kalite riski sanıldığı kadar büyük değil: müşterinin gördüğü katalog `venue_songs`, hasat `songs` havuzunu büyütüyor; serbest metin eşleşmesi lib/song-match.ts ve lib/request-approval.ts view_count + Topic tercihiyle sıralıyor, yani 95 bin az izlenen derin kesit müşteri aramasını boğmuyor. Bkz [[pmj-kotasiz-mimari-2026-08]].

**21 Eyl 2026 — yeni çıkanlar OTOMATİK:** Vercel cron `/api/cron/catalog-new` her gün 06:00 UTC (kota 07:00 UTC'de sıfırlanır → gecenin artan kotası), tavan 3000 birim / 240 sn. Kaynak: `catalog_topic_uploads()` RPC (text[] döner — tablo dönünce PostgREST 1000'de kesiyordu; kısmi indeks songs_topic_channel_idx ile ~1,6 sn). Durum `catalog_sources` tablosunda (0053, uygulandı); betik de her listeden sonra oraya yazar ve açılışta .seed-state.json'u oraya aktarır. Kayıtlı liste en yeni sayfadan okunur, bilinen şarkıda durur; kayıtsız liste baştan sona okunur. Süzgeç ortak: lib/catalog-row.ts. Commit ile prod'da.

**30 Eyl 2026:** `catalog_topic_uploads()` ~880 bin satırlık havuzda 8 sn sınırını aştı (fonksiyon içinden ~12 sn; 776 bin Topic satırını okuyup 1.673 kanal buluyordu). 0062 özyinelemeli skip scan'e çevirdi: ~0,2 sn, süre artık kanal sayısıyla ölçekleniyor. `DISTINCT` ile az farklı değer arayan sorgularda aynı kalıbı kullan.
