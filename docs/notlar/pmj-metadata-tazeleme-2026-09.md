---
name: pmj-metadata-tazeleme-2026-09
description: YouTube 30 gün kuralı için songs metadata tazeleme (21 Eyl 2026) — günde havuz/20, en eski önce, 0054 RPC'leri; eski kod fiilen günde 1.000 satır yapıyordu; 4 Eki: aday okuma soğuk önbellekte timeout → 0066 kapsayan indeks ŞART
metadata:
  type: project
---

`app/api/cron/youtube-refresh` (03:00 UTC) → `lib/metadata-refresh.ts`. Her gün en eskiden başlayarak havuzun 1/20'si (min 1.000, max 75.000 satır = 1.500 birim), 7 günden yeni satır sorulmaz. Adaylar `stale_song_video_ids(cutoff, limit)` RPC'si ile 20 binlik dilimlerle (text[] döner), yazma `refresh_song_metadata(jsonb)` ile 1.000'lik toplu; 3 parti paralel. 0054 uygulandı. Ölçüm (21 Eyl, preview): 39.198 satır 61 sn, 784 birim.

**Why:** Eski kod "havuz/30, en çok 5000" diyordu ama PostgREST 1.000'de kestiği için günde 1.000 satır tazeleniyordu; havuz hasatla ~780 bine çıktı, ~512 bin satırın 30 günü 19-21 Ekim'e denk geliyordu. YouTube kota başvurusunun uyum incelemesi bu kuralı kontrol ediyor.

**How to apply:** (1) PostgREST'ten >1.000 satır lazımsa dizi döndüren RPC kullan. (2) 4 paralel yazma + hasat aynı anda API rolünün 8 sn sorgu sınırına dayadı → 3. (3) Her turda baştan okumak, tazelenen satırların ölü indeks kayıtları yüzünden yavaşlıyor — aday listesini baştan al. Cron yanıtındaki `metadata_refresh.ms` adım sürelerini gösterir. Bkz. [[pmj-katalog-hasadi-2026-09]], [[pmj-youtube-quota-2026-07]].

**30 Eyl 2026:** 29 Eyl hiç, 30 Eyl yalnız 2.000 satır tazelendi — Sentry "metadata yazılamadı: statement timeout". Sebep 0056'nın iki trigram (GIN) indeksi: her güncelleme onlara da yazıyor, 1.000 satırlık tek çağrı 5,7-13 sn sürdü (250 satır 0,5-0,85 sn). Yazma artık 250'lik dilimlerle (`WRITE_CHUNK`). songs'a yeni indeks eklerken toplu yazmaları yeniden ölç. Bkz. [[pmj-songs-trigram-2026-09]]. Aynı gün: yazılamayan dilim bir kez yeniden denenir, olmazsa atlanır (ertesi gün en eski olarak ilk sırada gelir); 4 dilim düşerse tur `stopped: "db"` ile durur ama playlist senkronu yine çalışır (eskiden tek hata ikisini de düşürüyordu); atlama Sorunlar ekranına + Sentry'ye `metadata_refresh_partial` olarak düşer. 0063 songs'un autovacuum eşiklerini %20'den %2'ye indirdi (22-30 Eyl arası hiç vacuum yoktu, 106 bin ölü satır).

**4 Eki 2026:** 3 ve 4 Eki tur ilk sorguda çöktü: "adaylar okunamadı: statement timeout". Yazma değil aday okuma. En eski satırlar heap'e dağılmış (tazelenen satır yeni sayfaya taşınıyor), 20 bin aday ≈ 19.500 rastgele heap sayfası; 06:00'da önbellek soğukken 7,9 sn, ısınınca 0,13 sn. Çözüm 0066: `(metadata_refreshed_at) include (youtube_video_id)` kapsayan indeks, eskisinin yerine (index-only scan, heap'e gitmez). Aday okuma bir kez yeniden dener; tazeleme çökse de playlist senkronu artık çalışır. 30 Eyl'deki tek `catalog_new_failed` (catalog_topic_uploads timeout) 0063 vacuum'undan sonra tekrarlamadı. Ders: songs'tan sık okunan dar sorgular için kapsayan indeks; "ısınınca hızlı" ölçüm yanıltır, ilk çalıştırmayı ölç.
