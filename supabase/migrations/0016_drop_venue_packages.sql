-- 0016: Mekan bazlı jeton paketleri tablosu kaldırılır.
-- SIRALAMA: Yalnızca global fiyatlandırma kodu deploy edilip DOĞRULANDIKTAN
-- sonra çalıştırılmalı (yeni kod token_packages'a hiç dokunmaz).

begin;
drop table if exists public.token_packages;
commit;
