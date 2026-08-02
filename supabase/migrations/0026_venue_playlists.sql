-- 0026: Mekan playlist'leri — otomatik çalma havuzu ile müşteri katalogunun ayrılması.
--
-- Bugüne kadar mekanın tek düz listesi vardı (venue_songs) ve aynı liste iki işi
-- birden görüyordu: auto-fill havuzu + müşterinin seçebildiği katalog.
--
-- Yeni model:
--   * playlists        — mekanın isimli listeleri; is_active olanlar "şu an çalan repertuvar"
--   * playlist_songs    — hangi şarkı hangi listede (bir şarkı birden çok listede olabilir)
--   * venue_songs       — DEĞİŞMEDİ: mekanın müşteriye açık katalogu (play_count, in_venue_list)
--
-- Kurallar:
--   1. Auto-fill (lib/queue-fill.ts) yalnızca AKTİF playlist'lerdeki şarkılardan seçer.
--      Aynı anda birden fazla playlist aktif olabilir — havuz onların birleşimidir.
--      Hiç aktif playlist yoksa müzik susmasın diye tüm kataloga düşülür.
--   2. Müşteri tarafı hiç değişmez: katalog = venue_songs = tüm playlist'lerin birleşimi.
--      Hangi playlist'in aktif olduğu müşteriyi ilgilendirmez.
--   3. Bir şarkı hiçbir playlist'te kalmayınca katalogdan da düşer — bunu aşağıdaki
--      prune trigger'ı garanti eder (playlist silinip cascade geldiğinde de çalışır).
--
-- Geçiş: her mekanın mevcut tüm şarkıları "Playlist 1" altında toplanır ve o playlist
-- aktif işaretlenir; böylece bu SQL uygulandığı anda davranış birebir aynı kalır.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0025'ten SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (eski kod venue_songs'u okumaya devam
-- ettiği için bu SQL tek başına hiçbir şeyi bozmaz).

begin;

-- 1) Playlist'ler
create table if not exists public.playlists (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  name       text not null,
  is_active  boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists playlists_venue_idx
  on public.playlists (venue_id, sort_order, created_at);

-- 2) Playlist üyelikleri.
--    venue_id denormalize: prune trigger'ı playlist cascade ile silinirken parent
--    satırı artık okuyamaz, ayrıca auto-fill tek tabloda venue'ya göre filtreleyebilir.
create table if not exists public.playlist_songs (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues (id) on delete cascade,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  song_id     uuid not null references public.songs (id) on delete cascade,
  added_at    timestamptz not null default now(),
  unique (playlist_id, song_id)
);

create index if not exists playlist_songs_venue_song_idx
  on public.playlist_songs (venue_id, song_id);

-- 3) venue_songs tekilliği: aşağıdaki backfill ve "varsa ekleme" akışları buna dayanıyor.
--    Kopya satır olmaması gerekiyor ama migration yarıda kalmasın diye önce temizlenir.
delete from public.venue_songs dup
 using public.venue_songs keep
 where dup.venue_id = keep.venue_id
   and dup.song_id = keep.song_id
   and dup.ctid > keep.ctid;

create unique index if not exists venue_songs_venue_song_key
  on public.venue_songs (venue_id, song_id);

-- 4) Geçiş: her mekana varsayılan (aktif) playlist + mevcut şarkıların taşınması
insert into public.playlists (venue_id, name, is_active, sort_order)
select v.id, 'Playlist 1', true, 0
  from public.venues v
 where not exists (select 1 from public.playlists p where p.venue_id = v.id);

with defaults as (
  select distinct on (venue_id) venue_id, id
    from public.playlists
   order by venue_id, sort_order, created_at
)
insert into public.playlist_songs (venue_id, playlist_id, song_id)
select vs.venue_id, d.id, vs.song_id
  from public.venue_songs vs
  join defaults d on d.venue_id = vs.venue_id
on conflict (playlist_id, song_id) do nothing;

-- 5) Hiçbir playlist'te kalmayan şarkı katalogdan düşer (kural 3).
--    Tek tek silmede de, playlist silinip cascade geldiğinde de aynı yol işler.
create or replace function public.prune_orphan_venue_songs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.venue_songs vs
   where vs.venue_id = old.venue_id
     and vs.song_id = old.song_id
     and not exists (
       select 1 from public.playlist_songs ps
        where ps.venue_id = old.venue_id
          and ps.song_id = old.song_id
     );
  return old;
end
$$;

drop trigger if exists playlist_songs_prune_orphans on public.playlist_songs;
create trigger playlist_songs_prune_orphans
  after delete on public.playlist_songs
  for each row execute function public.prune_orphan_venue_songs();

-- 6) RLS: okuma herkese açık (admin paneli ve realtime anon anahtarla okuyor),
--    yazma yalnızca service-role — venue_songs ile aynı güven modeli (bkz. 0002).
alter table public.playlists      enable row level security;
alter table public.playlist_songs enable row level security;

drop policy if exists "playlists_public_read" on public.playlists;
create policy "playlists_public_read" on public.playlists
  for select to anon, authenticated using (true);

drop policy if exists "playlist_songs_public_read" on public.playlist_songs;
create policy "playlist_songs_public_read" on public.playlist_songs
  for select to anon, authenticated using (true);

-- 7) Realtime: admin paneli iki cihazda açıkken liste değişiklikleri anında yansısın.
--    Yeni tablolar yayına kendiliğinden girmiyor; zaten ekliyse dokunulmaz.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlists'
    ) then
      alter publication supabase_realtime add table public.playlists;
    end if;

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlist_songs'
    ) then
      alter publication supabase_realtime add table public.playlist_songs;
    end if;
  end if;
end
$$;

commit;
