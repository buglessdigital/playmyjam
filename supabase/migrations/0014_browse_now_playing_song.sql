-- 0014: Gözat ekranındaki "Şu An Çalıyor" banner'ı otomatik çalmada da görünsün.
-- get_browse_user_state'in now_playing nesnesine song_id eklenir; istemci banner
-- şarkısını artık müşteri kuyruğundaki 'playing' kaydına değil now_playing'e bakarak bulur.

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
    'token_balance', coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0),
    'favorite_ids', coalesce((
      select jsonb_agg(song_id) from public.user_favorites where user_id = auth.uid()
    ), '[]'::jsonb),
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
