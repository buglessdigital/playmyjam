-- Temel şema: ilk kurulumda Supabase Dashboard'dan elle oluşturulmuş tablolar.
-- 0001-0049 bu tabloların üzerine yazıldığı için hiçbir migration'da yoktular;
-- yeni bir projeyi sıfırdan kurabilmek için 0001'den ÖNCEKİ hâl burada yeniden kuruldu.
-- Bilerek "eski" hâlde: Spotify kolonları, user_tokens ve token_packages sonraki
-- migration'larda dönüştürülüp düşürülüyor. Son hâle 0001-0049 sırayla getirir.
-- Uygulama: boş projede 0001'den ÖNCE çalıştırın.

begin;

create extension if not exists pgcrypto;

create table public.venues (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  name                     text not null,
  tagline                  text,
  logo_url                 text,
  status                   text default 'active',
  created_at               timestamptz default now(),
  spotify_access_token     text,
  spotify_refresh_token    text,
  spotify_token_expires_at timestamptz
);

create table public.venue_admins (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid references public.venues (id) on delete cascade,
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz default now()
);

create table public.songs (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  artist           text not null,
  album_cover_url  text,
  duration_ms      integer,
  spotify_track_id text unique
);

create table public.venue_songs (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid references public.venues (id) on delete cascade,
  song_id       uuid references public.songs (id) on delete cascade,
  play_count    integer default 0,
  in_venue_list boolean default true,
  added_at      timestamptz default now()
);

create table public.queue (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid references public.venues (id) on delete cascade,
  song_id      uuid references public.songs (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete cascade,
  added_by     text,
  tokens_spent integer default 1,
  priority     boolean default false,
  position     integer,
  status       text default 'queued',
  added_at     timestamptz default now(),
  played_at    timestamptz
);

create index queue_user_idx on public.queue (user_id);

create table public.now_playing (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid unique references public.venues (id) on delete cascade,
  song_id     uuid references public.songs (id) on delete set null,
  started_at  timestamptz,
  progress_ms integer default 0,
  is_playing  boolean default false
);

create table public.song_requests (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid references public.venues (id) on delete cascade,
  song_id      uuid not null references public.songs (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete cascade,
  requested_by text,
  status       text default 'pending',
  requested_at timestamptz default now(),
  resolved_at  timestamptz
);

create index song_requests_venue_idx on public.song_requests (venue_id, status);

create table public.user_favorites (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  song_id uuid references public.songs (id) on delete cascade,
  unique (user_id, song_id)
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Eski mekan bazlı jeton yapısı (0010/0011 ve 0016 ile kaldırılır)
create table public.token_packages (
  id       uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues (id) on delete cascade,
  label    text,
  tokens   integer not null,
  price    numeric(10,2) not null
);

create table public.user_tokens (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users (id) on delete cascade,
  venue_id uuid references public.venues (id) on delete cascade,
  balance  integer not null default 0
);

commit;
