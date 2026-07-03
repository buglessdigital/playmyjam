-- Müşteri paneli sayfaları için tek-round-trip okuma fonksiyonları.
-- Her sayfa açılışında 3-7 ayrı sorgu yerine tek RPC çağrısı yapılır (mobilde
-- her round-trip ~100-150 ms — bu fonksiyonlar algılanan gecikmeyi ciddi düşürür).
-- security invoker: RLS politikaları (0002) aynen uygulanır; kullanıcıya özel
-- alanlar auth.uid() üzerinden kendi satırlarını okur.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0002'den SONRA çalıştırın.

-- Kuyruk sayfası: şu an çalan + ilk 10 kuyruk girdisi
create or replace function public.get_queue_state(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'now_playing', (
      select jsonb_build_object(
        'song_id', np.song_id,
        'progress_ms', np.progress_ms,
        'is_playing', np.is_playing,
        'started_at', np.started_at,
        'songs', case when s.id is null then null else jsonb_build_object(
          'title', s.title, 'artist', s.artist,
          'album_cover_url', s.album_cover_url, 'duration_ms', s.duration_ms
        ) end
      )
      from public.now_playing np
      left join public.songs s on s.id = np.song_id
      where np.venue_id = p_venue_id
      limit 1
    ),
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'song_id', q.song_id, 'added_by', q.added_by,
        'tokens_spent', q.tokens_spent, 'priority', q.priority,
        'position', q.position, 'added_at', q.added_at,
        'songs', jsonb_build_object(
          'title', s.title, 'artist', s.artist,
          'album_cover_url', s.album_cover_url, 'duration_ms', s.duration_ms
        )
      ) order by q.priority desc, q.position asc)
      from (
        select * from public.queue iq
        where iq.venue_id = p_venue_id and iq.status = 'queued'
        order by iq.priority desc, iq.position asc
        limit 10
      ) q
      join public.songs s on s.id = q.song_id
    ), '[]'::jsonb)
  );
$$;

-- Gözat sayfası: kullanıcı/canlı durum (katalog server'da cache'li, burada yok)
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
      select balance from public.user_tokens
      where user_id = auth.uid() and venue_id = p_venue_id
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

-- Şarkı detay sayfası: kullanıcı/canlı durum (track bilgisi server'da cache'li)
create or replace function public.get_song_user_state(p_venue_id uuid, p_spotify_track_id text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with song as (
    select id from public.songs where spotify_track_id = p_spotify_track_id limit 1
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
    'is_favorite', exists(
      select 1 from public.user_favorites f
      where f.user_id = auth.uid() and f.song_id = (select id from song)
    ),
    'token_balance', coalesce((
      select balance from public.user_tokens
      where user_id = auth.uid() and venue_id = p_venue_id
    ), 0),
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

-- Profil sayfası: kullanıcı özeti
create or replace function public.get_profile_state(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'username', (select username from public.profiles where id = auth.uid()),
    'token_balance', coalesce((
      select balance from public.user_tokens
      where user_id = auth.uid() and venue_id = p_venue_id
    ), 0),
    'fav_count', (select count(*) from public.user_favorites where user_id = auth.uid()),
    'request_count', (select count(*) from public.queue where user_id = auth.uid())
  );
$$;

-- Bu fonksiyonlar yalnızca giriş yapmış müşteriler için
revoke execute on function public.get_queue_state(uuid) from public, anon;
revoke execute on function public.get_browse_user_state(uuid) from public, anon;
revoke execute on function public.get_song_user_state(uuid, text) from public, anon;
revoke execute on function public.get_profile_state(uuid) from public, anon;
grant execute on function public.get_queue_state(uuid) to authenticated;
grant execute on function public.get_browse_user_state(uuid) to authenticated;
grant execute on function public.get_song_user_state(uuid, text) to authenticated;
grant execute on function public.get_profile_state(uuid) to authenticated;
