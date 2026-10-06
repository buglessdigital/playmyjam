-- Hasat turunda son eklenen şarkıların adları — ekranda "şu an ne giriyor".
--
-- Neden kolon: songs tablosunda "ne zaman eklendi" bilgisi YOK ve eklemek
-- istemiyoruz; now() varsayılanlı kolon 975 bin satırda tablo yeniden yazımı
-- demek. Turun kendi satırında son birkaç başlığı taşımak hem bedava hem de
-- ekranın sorduğu soruya ("şu an ne ekleniyor") doğrudan cevap.
alter table public.catalog_runs add column if not exists last_songs text[];

grant select (last_songs), insert (last_songs), update (last_songs)
  on public.catalog_runs to service_role;
