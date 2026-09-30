-- catalog_topic_uploads() 30 Eyl 2026'da API rolünün 8 sn sınırına takıldı
-- (Sentry: "kaynaklar okunamadı: canceling statement due to statement timeout").
-- Havuz ~880 bine çıktı; 776 bin Topic satırını okuyup sıralayarak 1.673 farklı
-- kanal buluyordu (fonksiyon içinden ~12 sn). Şimdi aynı kısmi indeks üzerinde
-- özyinelemeli "skip scan": her adım bir sonraki kanal kimliğine atlar, kanal
-- başına tek indeks araması (~0,6 sn). Havuz büyüdükçe süre satırla değil
-- kanal sayısıyla artar.
create or replace function public.catalog_topic_uploads()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with recursive ch as (
    select min(channel_id) as id
    from public.songs
    where channel_title ilike '%- Topic'
    union all
    select (
      select min(s.channel_id)
      from public.songs s
      where s.channel_title ilike '%- Topic'
        and s.channel_id > ch.id
    )
    from ch
    where ch.id is not null
  )
  select coalesce(array_agg('UU' || substr(id, 3) order by id), '{}')
  from ch
  where id like 'UC%'
$$;

revoke all on function public.catalog_topic_uploads() from public, anon, authenticated;
grant execute on function public.catalog_topic_uploads() to service_role;
