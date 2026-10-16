-- 0080: songs'un vacuum'u metadata tazeleme turunun ORTASINDA değil, SONRASINDA.
--
-- 0063 vacuum eşiğini %2'ye indirmişti (≈ 25 bin ölü satır). Günlük tur ~62
-- bin satır güncelliyor, yani eşiği ilk 1,5 dakikada kendisi aşıyor ve
-- autovacuum tur sürerken tabloyu 9 indeksiyle (iki trigram GIN dahil)
-- taramaya başlıyor. 15 Eki 2026: tur ilk dakikada 13.250 satır yazdı,
-- vacuum başlayınca dakikada ~6 bine düştü, 11 zaman aşımı, 180 sn'de 62 binin
-- 28.743'ünde kaldı (vacuum 03:03'te bitti; her dakika 20 ms süren pg_cron işi
-- o iki dakikada 2-3 sn sürdü). Tablo 1,24 milyon satır / 660 MB, veritabanı
-- önbelleği ~224 MB.
--
-- 1) Ölü satır eşiği %10 (≈ 125 bin): günün iki tazeleme turu toplam ~62 bin
--    satır değiştirir, tur sırasında tetiklenmez. Insert ve analyze eşikleri
--    %2'de kalır (hasat eklemeleri 06:00'da, görünürlük haritası için).
-- 2) Temizliği pg_cron yapar: iki turun da bitiminden sonra (03:10 ve 08:10
--    UTC). 0063'ün amacı — vacuum'un düzenli çalışması — böylece korunur.
--
-- Uygulama: kod sırası fark etmez. VACUUM tabloyu kilitlemez (okuma/yazma
-- sürer); pg_cron komutu transaction dışında çalıştırır.

alter table public.songs set (autovacuum_vacuum_scale_factor = 0.1);

-- Aynı adla tekrar çağrılırsa mevcut işi günceller (idempotent)
select cron.schedule(
  'songs-vacuum-after-refresh',
  '10 3,8 * * *',
  $$vacuum (analyze) public.songs$$
);
