-- Metadata tazelemenin sonraki aday dilimini kaldığı yerden okuması.
--
-- 7 Eki 2026 cron'u ilk 20 bin satırı yazdı, ikinci aday okumasında iki kez
-- 8 sn statement timeout'a düştü ("adaylar okunamadı"). stale_song_video_ids
-- (0054) her dilimde indeksin en başından okuyor; az önce tazelenen 20 bin
-- satırın eski kayıtları indeksin tam başında ölü duruyor ve görünürlük
-- haritası henüz işaretlenmediği için her biri heap'e bakılarak atlanıyor.
-- 06:00'da önbellek soğukken ölçüm 3,9 sn / 11 bin heap okuması (ısınınca
-- 5 ms); cron'un yazma yükü altında sınırı aşıyor.
--
-- p_after verilince tarama o zaman damgasından başlar, ölü kayıtların üstünden
-- atlar. `>=` bilerek: toplu eklemeler aynı now() değerini paylaşıyor (en büyük
-- grup 2.000 satır), dilim grubun ortasında bitebilir. Grubun tazelenmiş
-- satırları yeni zaman damgasına taşındığı için (> cutoff) tekrar gelmez.
-- Dönüş jsonb: ids + bir sonraki çağrının p_after'ı (tablo dönseydi PostgREST
-- 1.000'de keserdi).

create or replace function public.stale_song_candidates(
  p_cutoff timestamptz,
  p_after timestamptz,
  p_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ids', coalesce(jsonb_agg(youtube_video_id order by metadata_refreshed_at), '[]'::jsonb),
    'last', max(metadata_refreshed_at)
  )
  from (
    select youtube_video_id, metadata_refreshed_at
    from public.songs
    where metadata_refreshed_at < p_cutoff
      and (p_after is null or metadata_refreshed_at >= p_after)
    order by metadata_refreshed_at
    limit p_limit
  ) oldest
$$;

revoke all on function public.stale_song_candidates(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_song_candidates(timestamptz, timestamptz, integer) to service_role;
