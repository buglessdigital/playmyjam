-- Farklı sanatçı sayısı: gerçek sayım yerine planlayıcı istatistiği.
--
-- Neden: 0065'teki count(distinct artist) havuz 975 bine çıkınca PostgREST'in
-- 8 saniyelik sorgu sınırını aştı ve ekranda sanatçı sayısı hep boş kaldı
-- ("canceling statement due to statement timeout", ölçüm 8,3 sn).
--
-- pg_stats.n_distinct ANALYZE'ın bıraktığı tahmindir ve anında okunur:
--   pozitif  → doğrudan farklı değer sayısı
--   negatif  → satır sayısına ORAN (-0.03 = satırların %3'ü kadar farklı değer)
-- Ekran bu sayıyı zaten "yaklaşık" diye gösteriyor; tam sayım bir gösterge
-- satırı için 8 saniyelik tarama etmez.
create or replace function public.catalog_artist_count()
returns bigint
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select case
    when s.n_distinct is null then null
    when s.n_distinct >= 0 then s.n_distinct::bigint
    else (-s.n_distinct * c.reltuples)::bigint
  end
  from pg_class c
  left join pg_stats s on s.schemaname = 'public' and s.tablename = 'songs' and s.attname = 'artist'
  where c.oid = 'public.songs'::regclass;
$$;

revoke all on function public.catalog_artist_count() from anon, authenticated;
grant execute on function public.catalog_artist_count() to service_role;
