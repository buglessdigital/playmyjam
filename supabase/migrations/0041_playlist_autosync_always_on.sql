-- 0041 — Otomatik senkron artık mekan ayarı değil, varsayılan davranış.
--
-- Panelden "Senkron açık/kapalı" düğmesi kaldırıldı: YouTube'dan içe aktarılan
-- her liste her gün güncellenir. Kota etkisi ihmal edilebilir — lib/playlist-sync.ts
-- kademeli okuma yapar (50 liste = 1 birim ön kontrol) ve günlük 1000 birimlik
-- sert bütçeyle sınırlıdır.
--
-- auto_sync kolonu KALIR: artık kullanıcı anahtarı değil, ölü kaynak freni.
-- 10 üst üste hatada (liste silinmiş/gizli) kaynak dondurulur; "şimdi güncelle"
-- ile yapılan başarılı bir tur onu yeniden açar.

-- Elle kapatılmış eski kaynakları aç. Hata yüzünden donmuş olanlara (fail_count
-- yüksek) dokunma — onlar zaten kırık, boşuna kota harcamasınlar.
update public.playlist_sources
set auto_sync = true,
    next_check_at = now()
where auto_sync = false
  and coalesce(fail_count, 0) < 10;

-- Yeni satırlar için varsayılan: import route zaten true gönderiyor, bu
-- veritabanı tarafındaki ikinci emniyet.
alter table public.playlist_sources
  alter column auto_sync set default true;
