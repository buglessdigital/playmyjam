-- 0079: Mekanlar haritasında "en çok çalan tür" ŞARKI bazında.
--
-- 0073'te tür sanatçıdan geliyordu: mekanın en çok çalınan 30 sanatçısı,
-- her biri iTunes'taki baskın türüyle sayılıyordu. Bir sanatçının farklı
-- türdeki şarkısı (pop sanatçısının rock şarkısı, rap şarkısının dance
-- remix'i) yanlış aileye düşüyor, ilk 30 dışındaki sanatçılar hiç sayılmıyordu.
--
-- Yeni kural: son 30 günde çalınan HER çalma, o şarkının kendi türüne bir
-- sayılır. Aynı şarkı 300 kez çaldıysa 300 sayılır.
--
-- • song_genres: şarkı → tür önbelleği. songs'a kolon EKLENMİYOR (830 bin
--   satır, toplu yazmaları zaten sınırda — bkz. 0063/0066). Tür iTunes'tan
--   şarkı adı + sanatçıyla öğrenilir; şarkı bulunamazsa sanatçının türü
--   yazılır (source = 'artist', bkz. lib/song-genre.ts). genre NULL = "baktık,
--   bulamadık" — 30 gün sonra yeniden denenir.
--
-- • venue_genre_plays(): mekanın çalmalarının ham iTunes türüne göre
--   toplamı + türü henüz bilinmeyen şarkılar (en çok çalınan önce). Ham tür
--   ailelere kodda indirgenir (lib/genres.ts).
--
-- • songs_missing_genre(): haritadaki mekanlarda çalınmış, türü bilinmeyen
--   şarkılar — /api/cron/song-genres bunları doldurur.
--
-- Uygulama: ÖNCE bu SQL, SONRA kod. Tersi kartı kırmaz, yalnız tür alanı boş
-- kalır. artist_genres yerinde kalıyor (şarkı bulunamazsa ona düşülüyor).

begin;

create table if not exists public.song_genres (
  song_id      uuid primary key references public.songs(id) on delete cascade,
  genre        text,
  -- 'song': iTunes'ta şarkının kendisi bulundu; 'artist': sanatçının türü
  source       text check (source in ('song', 'artist')),
  looked_up_at timestamptz not null default now()
);

alter table public.song_genres enable row level security;
revoke all on public.song_genres from anon, authenticated;
grant select, insert, update, delete on public.song_genres to service_role;

create or replace function public.venue_genre_plays(
  p_venue_id uuid,
  p_since    timestamptz,
  p_missing  integer default 40
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with song_counts as (
    select q.song_id, count(*)::int as plays
    from queue q
    where q.venue_id = p_venue_id
      and q.status = 'played'
      and q.played_at >= p_since
    group by q.song_id
  ),
  with_genre as (
    select sc.song_id, sc.plays, g.genre, g.looked_up_at
    from song_counts sc
    left join song_genres g on g.song_id = sc.song_id
  ),
  genre_counts as (
    select genre, sum(plays)::int as plays
    from with_genre
    where genre is not null
    group by genre
  ),
  missing as (
    select s.id, s.title, s.artist, w.plays
    from with_genre w
    join songs s on s.id = w.song_id
    where w.looked_up_at is null
       or (w.genre is null and w.looked_up_at < now() - interval '30 days')
    order by w.plays desc, s.id
    limit p_missing
  )
  select jsonb_build_object(
    'total', coalesce((select sum(plays) from song_counts), 0),
    'genres', coalesce(
      (select jsonb_agg(jsonb_build_object('genre', g.genre, 'plays', g.plays) order by g.plays desc)
       from genre_counts g),
      '[]'::jsonb
    ),
    'missing', coalesce(
      (select jsonb_agg(to_jsonb(m) order by m.plays desc) from missing m),
      '[]'::jsonb
    )
  )
$$;

revoke execute on function public.venue_genre_plays(uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.venue_genre_plays(uuid, timestamptz, integer) to service_role;

create or replace function public.songs_missing_genre(
  p_since timestamptz,
  p_limit integer default 100
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with song_counts as (
    select q.song_id, count(*)::int as plays
    from queue q
    join venues v on v.id = q.venue_id
    where q.status = 'played'
      and q.played_at >= p_since
      and v.status = 'active'
      and v.latitude is not null
    group by q.song_id
  ),
  missing as (
    select s.id, s.title, s.artist, sc.plays
    from song_counts sc
    join songs s on s.id = sc.song_id
    left join song_genres g on g.song_id = sc.song_id
    where g.song_id is null
       or (g.genre is null and g.looked_up_at < now() - interval '30 days')
    order by sc.plays desc, s.id
    limit p_limit
  )
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'artist', m.artist) order by m.plays desc)
     from missing m),
    '[]'::jsonb
  )
$$;

revoke execute on function public.songs_missing_genre(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.songs_missing_genre(timestamptz, integer) to service_role;

commit;
