-- Row Level Security politikaları.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0001'den SONRA çalıştırın.
--
-- Güven modeli:
--   * service-role anahtarı (yalnızca API rotaları) RLS'i bypass eder — tüm yazmalar oradan yapılır.
--   * anon/authenticated istemciler yalnızca aşağıda açıkça izin verilen okumaları yapabilir.
--   * Realtime (postgres_changes) RLS'e uyar; herkese-SELECT'li tablolarda abonelikler çalışır.

alter table public.venues          enable row level security;
alter table public.venue_admins    enable row level security;
alter table public.songs           enable row level security;
alter table public.venue_songs     enable row level security;
alter table public.queue           enable row level security;
alter table public.now_playing     enable row level security;
alter table public.song_requests   enable row level security;
alter table public.token_packages  enable row level security;
alter table public.user_tokens     enable row level security;
alter table public.user_favorites  enable row level security;
alter table public.profiles        enable row level security;

-- venues: herkes okuyabilir AMA Spotify token kolonları gizli (kolon bazlı grant)
drop policy if exists "venues_public_read" on public.venues;
create policy "venues_public_read" on public.venues
  for select to anon, authenticated using (true);

revoke select on public.venues from anon, authenticated;
grant select (id, slug, name, tagline, logo_url, status, created_at)
  on public.venues to anon, authenticated;

-- Herkese açık okunabilir tablolar (yazma yalnızca service-role)
drop policy if exists "songs_public_read" on public.songs;
create policy "songs_public_read" on public.songs
  for select to anon, authenticated using (true);

drop policy if exists "venue_songs_public_read" on public.venue_songs;
create policy "venue_songs_public_read" on public.venue_songs
  for select to anon, authenticated using (true);

drop policy if exists "queue_public_read" on public.queue;
create policy "queue_public_read" on public.queue
  for select to anon, authenticated using (true);

drop policy if exists "now_playing_public_read" on public.now_playing;
create policy "now_playing_public_read" on public.now_playing
  for select to anon, authenticated using (true);

-- song_requests: admin paneli + realtime anon anahtarla okuyor.
-- Bilinçli ödünleşim: istek sahibi kullanıcı adları mekan genelinde görünür.
drop policy if exists "song_requests_public_read" on public.song_requests;
create policy "song_requests_public_read" on public.song_requests
  for select to anon, authenticated using (true);

drop policy if exists "token_packages_public_read" on public.token_packages;
create policy "token_packages_public_read" on public.token_packages
  for select to anon, authenticated using (true);

-- user_tokens: kullanıcı yalnızca kendi bakiyesini görür; yazma yok (RPC/service-role)
drop policy if exists "user_tokens_own_read" on public.user_tokens;
create policy "user_tokens_own_read" on public.user_tokens
  for select to authenticated using (auth.uid() = user_id);

-- user_favorites: kullanıcı kendi favorilerini yönetir (tarayıcıdan yazma serbest)
drop policy if exists "user_favorites_own_select" on public.user_favorites;
create policy "user_favorites_own_select" on public.user_favorites
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_favorites_own_insert" on public.user_favorites;
create policy "user_favorites_own_insert" on public.user_favorites
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_favorites_own_delete" on public.user_favorites;
create policy "user_favorites_own_delete" on public.user_favorites
  for delete to authenticated using (auth.uid() = user_id);

-- profiles: kullanıcı yalnızca kendi profilini okur/günceller
drop policy if exists "profiles_own_select" on public.profiles;
create policy "profiles_own_select" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_own_update" on public.profiles;
create policy "profiles_own_update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_own_insert" on public.profiles;
create policy "profiles_own_insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- venue_admins: hiçbir politika yok — yalnızca service-role erişir
