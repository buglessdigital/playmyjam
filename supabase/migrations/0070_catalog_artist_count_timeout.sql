-- Sanatçı sayımına kendi sorgu sınırını ver.
--
-- Sayım 975 bin satırda ~12 sn sürüyor (btree indeksi + atlamalı tarama dahil
-- her yol aynı: 11-13 sn). API rolünün sınırı 8 sn olduğu için sonuç hiç
-- dönmüyor ve ekranda sanatçı kutusu boş kalıyordu.
--
-- Fonksiyon düzeyinde SET, çağrı boyunca rol ayarını geçersiz kılar. Yalnızca
-- bu fonksiyon için geçerli; genel sınır 8 sn olarak kalır (uzun sorguların
-- veritabanını meşgul etmesini önleyen koruma yerinde durur).
--
-- Ekran bu sayıyı ayrı istekle ve tek sefer alıyor; 12 sn beklemesi yalnızca o
-- kutuyu geciktirir, şarkı/liste sayıları ve hasat durumu 0,2 sn'de gelir.
create or replace function public.catalog_artist_count()
returns bigint
language sql
stable
security invoker
set search_path = public
set statement_timeout = '30s'
as $$
  select count(*) from (select artist from public.songs where artist is not null group by artist) t;
$$;

revoke all on function public.catalog_artist_count() from anon, authenticated;
grant execute on function public.catalog_artist_count() to service_role;
