-- Spotify → YouTube geçişi (temiz kesim).
-- Eski Spotify kataloğu eşleştirilmeden silinir; katalog müşteri aramalarıyla
-- YouTube üzerinden yeniden dolar. Oynatma artık admin cihazındaki gömülü
-- YouTube IFrame Player ile yapılır; Spotify OAuth/token kolonları kaldırılır.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0007'den SONRA çalıştırın.

begin;

-- 1) Eski katalog verisini temizle (FK sırasına dikkat: önce songs'a bağlı satırlar)
delete from public.song_requests;
delete from public.queue;
delete from public.user_favorites;
delete from public.venue_songs;
update public.now_playing set song_id = null, is_playing = false, progress_ms = 0;
delete from public.songs;

-- 2) songs: kimlik spotify_track_id → youtube_video_id
--    (0006'daki get_song_user_state spotify_track_id'ye bakıyor — önce onu düşür)
drop function if exists public.get_song_user_state(uuid, text);

alter table public.songs drop column if exists spotify_track_id;
alter table public.songs add column if not exists youtube_video_id text not null;
alter table public.songs add constraint songs_youtube_video_id_key unique (youtube_video_id);
-- Kanal adı ("X - Topic" ise sanatçı çıkarımında kullanıldı) ve embed durumu
alter table public.songs add column if not exists channel_title text;
alter table public.songs add column if not exists embeddable boolean not null default true;
-- Spotify popularity'nin yerini alan vekil metrik
alter table public.songs add column if not exists view_count bigint not null default 0;

-- 3) venues: Spotify OAuth kolonları tamamen kalkar (hesap bağlama yok artık)
alter table public.venues drop column if exists spotify_access_token;
alter table public.venues drop column if exists spotify_refresh_token;
alter table public.venues drop column if exists spotify_token_expires_at;
alter table public.venues drop column if exists spotify_account_id;
alter table public.venues drop column if exists spotify_account_name;

-- 4) now_playing: player sağlık takibi + çalan video kimliği
alter table public.now_playing add column if not exists video_id text;
alter table public.now_playing add column if not exists last_heartbeat_at timestamptz;

-- 5) YouTube arama önbelleği — kota koruması (search.list = 100 birim/çağrı).
--    Yalnızca service-role okur/yazar; RLS açık, politika yok.
create table if not exists public.search_cache (
  query      text primary key,
  results    jsonb not null,
  cached_at  timestamptz not null default now()
);
alter table public.search_cache enable row level security;

-- 6) get_song_user_state: kimlik parametresi video_id oldu
--    (parametre adı değiştiği için drop+create gerekti — yukarıda düşürüldü)
create function public.get_song_user_state(p_venue_id uuid, p_video_id text)
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

revoke execute on function public.get_song_user_state(uuid, text) from public, anon;
grant execute on function public.get_song_user_state(uuid, text) to authenticated;

commit;
