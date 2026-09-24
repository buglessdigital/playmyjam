-- Ortak havuzda metin araması için trigram indeksleri.
--
-- Hasatla songs ~830 bin satıra çıktı. Havuz aramaları başlık/sanatçıyı
-- `ilike '%...%'` ve `~*` (imatch) ile tarıyor; indeks olmadığı için her sorgu
-- tüm tabloyu okuyup 8 sn'lik statement timeout'a takılıyordu. Etkisi:
--   - Talep onayı (lib/request-approval.ts findInPool): hata "bulunamadı"
--     sayılıyor, başka mekanda çalan şarkı için bile YouTube bağlantısı isteniyordu.
--   - Panelin şarkı araması (app/api/search): sonuç dönmüyordu.
-- pg_trgm GIN indeksi hem ilike hem regex (~*) aramasını hızlandırır.
--
-- Tabloya yazmayı indeks bitene kadar kilitler (hasat cron'u o sırada
-- beklemeli). SQL Editor'da tek seferde çalıştırılabilir.

set statement_timeout = 0;

-- pg_trgm projede zaten kurulu (hangi şemada olduğu ortama göre değişiyor;
-- "create extension if not exists" burada 23505 hatası veriyordu). Kurulu
-- değilse kurulur, sonra opclass bulunduğu şemadan adreslenir.
do $$
declare
  trgm_schema text;
begin
  select n.nspname into trgm_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if trgm_schema is null then
    create extension pg_trgm with schema extensions;
    trgm_schema := 'extensions';
  end if;

  execute format(
    'create index if not exists songs_title_trgm_idx on public.songs using gin (title %I.gin_trgm_ops)',
    trgm_schema
  );
  execute format(
    'create index if not exists songs_artist_trgm_idx on public.songs using gin (artist %I.gin_trgm_ops)',
    trgm_schema
  );
end
$$;

analyze public.songs;
