-- 0081: PMJ listeleri — PMJ'nin hazırladığı ortak playlist'ler.
--
-- Super admin bir listeyi bir kez kurar (Excel'den içe aktarma), mekanlar kendi
-- panellerindeki "PMJ Listeleri" çubuğundan istediğini tek tıkla müşteriye
-- açar. Amaç: mekan bilindik şarkılar için talep onayıyla uğraşmasın.
--
-- Kararlar (16 Eki 2026, kullanıcı):
--   * ABONELİK, kopya değil: PMJ listesi güncellenince açan her mekanda güncellenir.
--   * Otomatik çalmaya GİRMEZ — yalnızca müşterinin seçebileceği katalog.
--   * Mekan türüne göre öneri yok; mekan listeyi kendisi açar/kapatır.
--
-- Uygulama: mekan listeyi açınca kendi `playlists` tablosuna PMJ'ye bağlı bir
-- satır (pmj_playlist_id dolu) + şarkı üyelikleri yazılır. Böylece müşteri
-- kataloğu, görünürlük (0040), katalogdan düşme (0026) ve sıraya ekleme
-- bugünkü yoldan çalışır. Kapatınca o satır silinir; cascade + 0026 trigger'ı
-- yalnızca PMJ'den gelen şarkıları katalogdan düşürür.
--
-- Bağlı satır otomatik çalmaya iki yoldan sızabilirdi, ikisi de kapalı:
--   1) Playlist kuyruğu: bağlı satırın queue_position'ı daima null (kod), panelin
--      rayında da görünmez.
--   2) Katalog yedeği (kuyrukta liste yokken venue_songs'tan rastgele dolum):
--      venue_songs.autoplay_ok yalnızca mekanın KENDİ listelerinden birinde olan
--      şarkılarda true. Yedek bu bayrağı okur (lib/queue-fill.ts).
--
-- Sıralama: ÖNCE bu SQL, SONRA kod. SQL tek başına davranışı değiştirmez
-- (henüz hiç PMJ listesi yok, autoplay_ok herkes için true doğar).

begin;

-- 1) PMJ listeleri (mekandan bağımsız)
create table if not exists public.pmj_playlists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists pmj_playlists_name_key
  on public.pmj_playlists (lower(name));

create table if not exists public.pmj_playlist_songs (
  pmj_playlist_id uuid not null references public.pmj_playlists (id) on delete cascade,
  song_id         uuid not null references public.songs (id) on delete cascade,
  position        integer not null default 0,
  added_at        timestamptz not null default now(),
  primary key (pmj_playlist_id, song_id)
);

create index if not exists pmj_playlist_songs_order_idx
  on public.pmj_playlist_songs (pmj_playlist_id, position);

-- 2) Mekan playlist'inin bağlı olduğu PMJ listesi. null = mekanın kendi listesi.
--    PMJ listesi silinince mekanlardaki bağlı satırlar da gider (cascade →
--    playlist_songs → 0026 katalog temizliği).
alter table public.playlists
  add column if not exists pmj_playlist_id uuid references public.pmj_playlists (id) on delete cascade;

-- Bir mekanda aynı PMJ listesi en fazla bir kez açık olabilir
create unique index if not exists playlists_venue_pmj_key
  on public.playlists (venue_id, pmj_playlist_id)
  where pmj_playlist_id is not null;

-- 3) Otomatik çalmaya uygunluk: "mekanın KENDİ listelerinden birinde mi"
--    sorusunun materyalize cevabı (0040'taki playlist_visible ile aynı desen).
alter table public.venue_songs
  add column if not exists autoplay_ok boolean not null default true;

create or replace function public.refresh_autoplay_ok(p_venue_id uuid, p_song_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.venue_songs vs
     set autoplay_ok = exists (
           select 1
             from public.playlist_songs ps
             join public.playlists p on p.id = ps.playlist_id
            where ps.venue_id = vs.venue_id
              and ps.song_id = vs.song_id
              and p.pmj_playlist_id is null
         )
   where vs.venue_id = p_venue_id
     and vs.song_id = any(p_song_ids)
     and vs.autoplay_ok is distinct from exists (
           select 1
             from public.playlist_songs ps
             join public.playlists p on p.id = ps.playlist_id
            where ps.venue_id = vs.venue_id
              and ps.song_id = vs.song_id
              and p.pmj_playlist_id is null
         );
$$;

create or replace function public.playlist_songs_sync_autoplay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_autoplay_ok(old.venue_id, array[old.song_id]);
    return old;
  end if;
  perform public.refresh_autoplay_ok(new.venue_id, array[new.song_id]);
  return new;
end
$$;

drop trigger if exists playlist_songs_sync_autoplay on public.playlist_songs;
create trigger playlist_songs_sync_autoplay
  after insert or delete on public.playlist_songs
  for each row execute function public.playlist_songs_sync_autoplay();

-- 4) RLS: okuma herkese açık (playlists ile aynı güven modeli, bkz. 0026),
--    yazma yalnızca service-role.
alter table public.pmj_playlists      enable row level security;
alter table public.pmj_playlist_songs enable row level security;

drop policy if exists "pmj_playlists_public_read" on public.pmj_playlists;
create policy "pmj_playlists_public_read" on public.pmj_playlists
  for select to anon, authenticated using (true);

drop policy if exists "pmj_playlist_songs_public_read" on public.pmj_playlist_songs;
create policy "pmj_playlist_songs_public_read" on public.pmj_playlist_songs
  for select to anon, authenticated using (true);

commit;
