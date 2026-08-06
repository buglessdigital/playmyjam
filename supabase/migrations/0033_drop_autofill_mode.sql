-- 0033: Karışık mod kaldırıldı — otomatik çalma daima sıralı rotasyondan geçer.
--
-- 0032'de iki mod bir arada yaşıyordu (venues.autofill_mode: 'mixed' | 'sequential').
-- Kullanımda karışık modun karşılığı olmadığı görüldü: mekan zaten listeleri
-- sırayla çalsın diye kuruyor, "rastgele" isteyen liste için playlists.shuffle
-- anahtarı var (liste İÇİNDE rastgele, listeler arası sıra korunur).
--
-- Kod artık bu kolonu hiç okumuyor; bu SQL yalnızca ölü kolonu temizler.
-- Sıralama: ÖNCE kod deploy'u, SONRA bu SQL (ters sırada da bir şey bozulmaz —
-- eski kod kolonu okuyamazsa 'mixed' varsayar, o da yalnızca panelin görüntüsünü
-- etkilerdi).
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0032'den SONRA çalıştırın.

begin;

alter table public.venues drop constraint if exists venues_autofill_mode_check;
alter table public.venues drop column if exists autofill_mode;

commit;
