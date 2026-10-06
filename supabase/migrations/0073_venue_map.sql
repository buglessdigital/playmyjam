-- 0073: Müşteri panelinde "Mekanlar" haritası.
--
-- Anlaşmalı mekanlar bir harita üzerinde gösterilir; mekana dokununca açılan
-- kartta o mekanda en çok çalınan şarkılar, en çok çalan tür ve sıradaki 10
-- şarkı var.
--
-- • venues.maps_url / latitude / longitude: super admin mekan düzenleme
--   ekranında Google Maps linkini yapıştırır, koordinat linkten çıkarılır
--   (bkz. lib/maps-link.ts). Koordinatı OLMAYAN mekan haritada görünmez —
--   test mekanları böylece kendiliğinden dışarıda kalır.
--   Okuma yalnız sunucudan (service_role); venues'taki kolon bazlı grant'lara
--   (bkz. 0002 / 0036) dokunulmuyor.
--
-- • artist_genres: sanatçı → tür önbelleği. Şemada tür bilgisi hiç yok; tür
--   iTunes Search API'den (anahtarsız, kotasız) sanatçı başına bir kez
--   öğrenilip burada tutulur (bkz. lib/artist-genre.ts). genre NULL = "baktık,
--   bulamadık" — 30 gün sonra yeniden denenir.
--
-- • venue_top_played(): bir mekanın son N günde en çok çalınan şarkıları ve
--   sanatçıları. Geçmiş zaten queue'da (status = 'played'); ayrı sayaç yok.
--
-- Uygulama: ÖNCE bu SQL, SONRA kod deploy'u. Kolonlar boş, tablo yeni; eski
-- kod hiçbirini okumadığı için SQL tek başına hiçbir şeyi değiştirmez.

begin;

alter table public.venues
  add column if not exists maps_url  text,
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

alter table public.venues drop constraint if exists venues_coords_check;
alter table public.venues add constraint venues_coords_check check (
  (latitude is null and longitude is null)
  or (latitude between -90 and 90 and longitude between -180 and 180)
);

create table if not exists public.artist_genres (
  -- Katlanmış ad (küçük harf, aksansız) — "Duman" ile "DUMAN" tek satır
  artist_key   text primary key,
  artist       text not null,
  genre        text,
  looked_up_at timestamptz not null default now()
);

alter table public.artist_genres enable row level security;
revoke all on public.artist_genres from anon, authenticated;
grant select, insert, update, delete on public.artist_genres to service_role;

-- Çalınmış satırlar zaman aralığıyla okunuyor; mevcut indeksler played_at
-- içermiyor. Kısmi: yalnız geçmiş satırları kapsar, sıradaki satırlara yük yok.
create index if not exists queue_venue_played_at_idx
  on public.queue (venue_id, played_at desc)
  where status = 'played';

create or replace function public.venue_top_played(
  p_venue_id uuid,
  p_since    timestamptz,
  p_songs    integer default 10,
  p_artists  integer default 30
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with played as (
    select q.song_id
    from queue q
    where q.venue_id = p_venue_id
      and q.status = 'played'
      and q.played_at >= p_since
  ),
  song_counts as (
    select song_id, count(*)::int as plays
    from played
    group by song_id
  ),
  top_songs as (
    select s.id, s.title, s.artist, s.album_cover_url, sc.plays
    from song_counts sc
    join songs s on s.id = sc.song_id
    order by sc.plays desc, s.title
    limit p_songs
  ),
  artist_counts as (
    select s.artist, sum(sc.plays)::int as plays
    from song_counts sc
    join songs s on s.id = sc.song_id
    group by s.artist
    order by plays desc
    limit p_artists
  )
  select jsonb_build_object(
    'total', (select count(*) from played),
    'songs', coalesce(
      (select jsonb_agg(to_jsonb(t) order by t.plays desc, t.title) from top_songs t),
      '[]'::jsonb
    ),
    'artists', coalesce(
      (select jsonb_agg(jsonb_build_object('artist', a.artist, 'plays', a.plays) order by a.plays desc)
       from artist_counts a),
      '[]'::jsonb
    )
  )
$$;

revoke execute on function public.venue_top_played(uuid, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.venue_top_played(uuid, timestamptz, integer, integer) to service_role;

commit;
