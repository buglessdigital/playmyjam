-- YouTube Developer Policy III.E.4: 30 günden eski metadata tazelenmeli.
-- Günlük cron (app/api/cron/youtube-refresh) satırları tek tek güncelliyordu:
-- havuz ~760 bin satıra çıkınca günde gereken ~38 bin güncelleme 300 sn'ye
-- sığmıyor. Bu fonksiyon 1.000 satırlık bir partiyi tek çağrıda yazar.
--
-- p_rows: [{youtube_video_id, title, artist, album_cover_url, duration_ms,
--           channel_title, view_count, embeddable}]
-- Silinmiş/gizlenmiş video yalnızca {youtube_video_id, embeddable:false} ile
-- gelir; diğer alanları olduğu gibi kalır (boş alan eskiyi ezmez).
-- Dönen kimlikler artık gömülemeyen şarkılar: çağıran taraf onları mekan
-- katalog ve listelerinden düşürür (lib/playlist.ts purgeUnplayableSong).

create or replace function public.refresh_song_metadata(p_rows jsonb)
returns table (song_id uuid)
language sql
security definer
set search_path = public
as $$
  with updated as (
  update public.songs s
  set title = coalesce(nullif(r.title, ''), s.title),
      artist = coalesce(nullif(r.artist, ''), s.artist),
      album_cover_url = coalesce(r.album_cover_url, s.album_cover_url),
      duration_ms = coalesce(r.duration_ms, s.duration_ms),
      channel_title = coalesce(r.channel_title, s.channel_title),
      view_count = coalesce(r.view_count, s.view_count),
      embeddable = r.embeddable,
      metadata_refreshed_at = now()
  from jsonb_to_recordset(p_rows) as r(
    youtube_video_id text,
    title text,
    artist text,
    album_cover_url text,
    duration_ms integer,
    channel_title text,
    view_count bigint,
    embeddable boolean
  )
  where s.youtube_video_id = r.youtube_video_id
  returning s.id, s.embeddable
  )
  select updated.id from updated where not updated.embeddable
$$;

revoke all on function public.refresh_song_metadata(jsonb) from public, anon, authenticated;
grant execute on function public.refresh_song_metadata(jsonb) to service_role;

-- Günün aday listesi tek sorguda: en eski p_limit satır. Tablo dönseydi
-- PostgREST 1.000'de keserdi; her 1.000'lik tur için yeniden okumak da
-- tazelenen satırların ölü indeks kayıtları üzerinden geçip yavaşlıyordu.
create or replace function public.stale_song_video_ids(p_cutoff timestamptz, p_limit integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(youtube_video_id order by metadata_refreshed_at), '{}')
  from (
    select youtube_video_id, metadata_refreshed_at
    from public.songs
    where metadata_refreshed_at < p_cutoff
    order by metadata_refreshed_at
    limit p_limit
  ) oldest
$$;

revoke all on function public.stale_song_video_ids(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_song_video_ids(timestamptz, integer) to service_role;
