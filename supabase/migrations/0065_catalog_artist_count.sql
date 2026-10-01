-- Havuzdaki farklı sanatçı sayısı — super admin Katalog ekranının üst satırı.
--
-- Neden RPC: PostgREST "count" verebiliyor ama "count distinct" veremiyor.
-- 900 bin satırda saniyeler süren bir sayım olduğu için ekran bunu yalnızca
-- ilk açılışta ister, 5 saniyelik yoklamalarda çağırmaz.
create or replace function public.catalog_artist_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct artist) from public.songs where artist is not null and btrim(artist) <> '';
$$;

revoke all on function public.catalog_artist_count() from anon, authenticated;
grant execute on function public.catalog_artist_count() to service_role;
