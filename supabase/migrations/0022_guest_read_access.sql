-- 0022: Misafir erişimi. Mekanın müşteri paneli artık giriş istemeden açılıyor;
-- kuyruk, gözat ve şarkı detayı sayfaları anon anahtarla da veri çekebilmeli.
--
-- Tablolar zaten anon'a okuma açık (0002: venues/songs/venue_songs/queue/
-- now_playing). Eksik olan tek şey sayfa RPC'lerinin anon'a kapalı olmasıydı.
--
-- Kullanıcıya özel alanlar (bakiye, favori) misafirde hiç sorgulanmaz:
-- auth.uid() null iken user_wallets/user_favorites'a dokunulmadan sabit
-- boş değer döner. Böylece RLS'e güvenmek yerine erişim baştan kesilir.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0021'den SONRA çalıştırın.

begin;

-- 1) Kuyruk sayfası: zaten tamamen mekan verisi, gövde değişmiyor — yalnızca grant
grant execute on function public.get_queue_state(uuid) to anon;

-- 2) Gözat sayfası (0014 gövdesi + misafir koruması)
create or replace function public.get_browse_user_state(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'queued_song_ids', coalesce((
      select jsonb_agg(distinct song_id) from public.queue
      where venue_id = p_venue_id and status = 'queued' and user_id is not null
    ), '[]'::jsonb),
    'recently_played', coalesce((
      select jsonb_agg(jsonb_build_object(
        'song_id', song_id,
        'played_at', (extract(epoch from played_at) * 1000)::bigint
      ))
      from public.queue
      where venue_id = p_venue_id and status = 'played' and user_id is not null
        and played_at >= now() - interval '30 minutes'
    ), '[]'::jsonb),
    'playing', (
      select jsonb_build_object(
        'song_id', song_id,
        'started_at', (extract(epoch from coalesce(added_at, now())) * 1000)::bigint
      )
      from public.queue
      where venue_id = p_venue_id and status = 'playing' and user_id is not null
      limit 1
    ),
    -- Misafirde cüzdan yok: tablo hiç okunmaz
    'token_balance', case when auth.uid() is null then 0 else coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0) end,
    'favorite_ids', case when auth.uid() is null then '[]'::jsonb else coalesce((
      select jsonb_agg(song_id) from public.user_favorites where user_id = auth.uid()
    ), '[]'::jsonb) end,
    'queue_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'priority', q.priority, 'duration_ms', coalesce(s.duration_ms, 0)
      ))
      from public.queue q
      left join public.songs s on s.id = q.song_id
      where q.venue_id = p_venue_id and q.status = 'queued' and q.user_id is not null
    ), '[]'::jsonb),
    'now_playing', (
      select jsonb_build_object(
        'song_id', np.song_id,
        'progress_ms', np.progress_ms, 'is_playing', np.is_playing,
        'duration_ms', s.duration_ms
      )
      from public.now_playing np
      join public.songs s on s.id = np.song_id
      where np.venue_id = p_venue_id
      limit 1
    )
  );
$$;

-- 3) Şarkı detay sayfası (0010 6b gövdesi + misafir koruması)
create or replace function public.get_song_user_state(p_venue_id uuid, p_video_id text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with song as (
    select id from public.songs where youtube_video_id = p_video_id limit 1
  )
  select jsonb_build_object(
    'db_song_id', (select id from song),
    'play_count', coalesce((
      select vs.play_count from public.venue_songs vs
      where vs.venue_id = p_venue_id and vs.song_id = (select id from song)
    ), 0),
    'in_venue_list', coalesce((
      select vs.in_venue_list from public.venue_songs vs
      where vs.venue_id = p_venue_id and vs.song_id = (select id from song)
    ), false),
    'is_favorite', case when auth.uid() is null then false else exists(
      select 1 from public.user_favorites f
      where f.user_id = auth.uid() and f.song_id = (select id from song)
    ) end,
    'token_balance', case when auth.uid() is null then 0 else coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0) end,
    'recently_played_at', (
      select (extract(epoch from max(played_at)) * 1000)::bigint
      from public.queue
      where venue_id = p_venue_id and song_id = (select id from song)
        and status = 'played' and user_id is not null
        and played_at >= now() - interval '30 minutes'
    ),
    'queue_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'song_id', q.song_id, 'priority', q.priority,
        'duration_ms', coalesce(s.duration_ms, 0)
      ))
      from public.queue q
      left join public.songs s on s.id = q.song_id
      where q.venue_id = p_venue_id and q.status = 'queued' and q.user_id is not null
    ), '[]'::jsonb),
    'now_playing', (
      select jsonb_build_object(
        'song_id', np.song_id, 'progress_ms', np.progress_ms,
        'is_playing', np.is_playing, 'duration_ms', coalesce(s.duration_ms, 0)
      )
      from public.now_playing np
      left join public.songs s on s.id = np.song_id
      where np.venue_id = p_venue_id
      limit 1
    )
  );
$$;

grant execute on function public.get_browse_user_state(uuid) to anon, authenticated;
grant execute on function public.get_song_user_state(uuid, text) to anon, authenticated;

-- get_profile_state, get_wallet_history ve get_played_history bilerek dışarıda:
-- tamamen kullanıcıya özel, misafirin açabileceği bir sayfada kullanılmıyor.

commit;
