-- Farklı sanatçı sayısını DOĞRU ve hızlı almak için btree indeksi + atlamalı tarama.
--
-- Hikâye: 0065 count(distinct artist) kullanıyordu, havuz 975 bine çıkınca 8 sn
-- sınırını aştı. 0067 pg_stats tahminine geçti ama tahmin 4.693 dedi, gerçek
-- değer ~27.000 — bu kadar çeşitli bir kolonda ANALYZE örneklemi fena yanılıyor.
-- Gösterge yanlış sayı göstereceğine hiç göstermemeli; doğrusu şu:
--
-- Atlamalı tarama (loose index scan): "ilk sanatçı" → "bundan büyük ilk sanatçı"
-- → ... Her adım indeksten tek satır okur, yani maliyet satır sayısıyla değil
-- FARKLI DEĞER sayısıyla orantılı (~27 bin adım). Postgres bunu kendiliğinden
-- yapmadığı için recursive CTE ile yazılır ve btree indeksi ŞART — indekssiz
-- her adım tam tarama olur (ölçüldü: 2 dakikada zaman aşımı).
set statement_timeout = 0;

create index if not exists songs_artist_idx on public.songs (artist) where artist is not null;

create or replace function public.catalog_artist_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  with recursive adim as (
    (select artist from public.songs where artist is not null order by artist limit 1)
    union all
    (select (select s.artist from public.songs s
             where s.artist > adim.artist and s.artist is not null
             order by s.artist limit 1)
     from adim where adim.artist is not null)
  )
  select count(*) from adim where artist is not null;
$$;

revoke all on function public.catalog_artist_count() from anon, authenticated;
grant execute on function public.catalog_artist_count() to service_role;
