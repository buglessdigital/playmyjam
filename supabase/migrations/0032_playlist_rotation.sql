-- 0032: Aktif playlist'lerin SIRAYLA çalması (rotasyon).
--
-- 0026'da auto-fill havuzu "tüm aktif playlist'lerin BİRLEŞİMİ"ydi ve içinden
-- rastgele seçiliyordu. Mekanların istediği ikinci bir düzen var: listeler bir
-- kuyruk gibi sırayla çalsın — Playlist 1 bitince Playlist 2 başlasın.
--
-- İki mod bir arada yaşıyor (venues.autofill_mode):
--   'mixed'      — 0026 davranışı, hiç değişmedi. VARSAYILAN: bu SQL uygulanınca
--                  hiçbir mekanın davranışı değişmez.
--   'sequential' — aktif listeler sort_order'a göre sırayla tüketilir.
--
-- Sıralı modun çalışması için iki şey kalıcı olmak zorunda: (1) hangi listedeyiz,
-- (2) bu turda o listenin hangi şarkıları tüketildi. Kuyruk 10 şarkılık bir pencere
-- olduğu için "liste bitti"yi kuyruğa bakarak anlamak mümkün değil — ilerleme
-- ayrı tutulur.
--
--   playlist_rotation          — mekan başına imleç: current playlist + tur numarası
--   playlist_rotation_consumed — (mekan, liste, tur, şarkı) → bu turda kuyruğa girdi
--
-- Tur (cycle) kavramı: son liste de bitince imleç başa döner ve cycle bir artar;
-- eski turun tüketim satırları silinir, böylece tüm şarkılar yeniden uygun olur.
--
-- Neden ayrı tablo, queue'ya bakmak yerine:
--   * queue satırları admin tarafından silinebiliyor (status='removed'); silinen
--     şarkının turda geri gelmesi istenmiyor.
--   * Aktif liste seçimi değişince bekleyen 'auto' satırları toptan düşürülüyor
--     (resetAutoQueue) — o satırların tüketimi geri alınmalı, kod bunu tüketim
--     tablosundan hedefli siliyor.
--
-- Ek kolonlar:
--   playlists.shuffle       — liste İÇİNDE sıra yerine karıştır (mod bağımsız değil:
--                             yalnızca sıralı modda anlamlı, karışık modda zaten rastgele)
--   playlist_songs.position — liste içi sıra. Bugüne kadar sıra kavramı yoktu;
--                             added_at'e göre backfill edilir (YouTube içe aktarımında
--                             bu zaten kaynak listenin sırasıdır).
--   queue.source_playlist_id— otomatik satırın hangi listeden geldiği (panelde rozet)
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0031'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (tüm kolonlar varsayılanlı/nullable,
-- eski kod hiçbirini okumadığı için bu SQL tek başına hiçbir şeyi bozmaz).

begin;

-- 1) Mekan başına otomatik doldurma modu
alter table public.venues
  add column if not exists autofill_mode text not null default 'mixed';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'venues_autofill_mode_check'
  ) then
    alter table public.venues
      add constraint venues_autofill_mode_check
      check (autofill_mode in ('mixed', 'sequential'));
  end if;
end
$$;

-- 2) Liste içi karıştırma anahtarı
alter table public.playlists
  add column if not exists shuffle boolean not null default false;

-- 3) Liste içi sıra. Mevcut üyelikler eklenme sırasına göre numaralanır.
alter table public.playlist_songs
  add column if not exists position int not null default 0;

with numbered as (
  select id, row_number() over (partition by playlist_id order by added_at, id) as rn
    from public.playlist_songs
)
update public.playlist_songs ps
   set position = numbered.rn
  from numbered
 where numbered.id = ps.id
   and ps.position = 0;

create index if not exists playlist_songs_order_idx
  on public.playlist_songs (playlist_id, position, added_at);

-- 4) Rotasyon imleci. Satır yoksa "henüz başlamadı" demektir; kod ilk dolumda açar.
--    playlist_id silinince null'a düşer — kod bunu "baştan başla" diye okur.
create table if not exists public.playlist_rotation (
  venue_id    uuid primary key references public.venues (id) on delete cascade,
  playlist_id uuid references public.playlists (id) on delete set null,
  cycle       int not null default 1,
  updated_at  timestamptz not null default now()
);

-- 5) Tur içinde tüketilen şarkılar. "Tüketildi" = kuyruğa otomatik olarak girdi
--    (çalındı ya da çalınmak üzere sıraya alındı) veya çalınamaz olduğu için atlandı.
create table if not exists public.playlist_rotation_consumed (
  venue_id    uuid not null references public.venues (id) on delete cascade,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  cycle       int  not null,
  song_id     uuid not null references public.songs (id) on delete cascade,
  consumed_at timestamptz not null default now(),
  primary key (venue_id, playlist_id, cycle, song_id)
);

-- İlerleme sorgusu (bu listede bu turda kaç şarkı tüketildi) bu indeksten geçer
create index if not exists playlist_rotation_consumed_progress_idx
  on public.playlist_rotation_consumed (venue_id, playlist_id, cycle);

-- 6) Otomatik kuyruk satırının kaynağı — panelde "hangi listeden geldi" rozeti.
--    Liste silinirse satır kalır, yalnızca kaynak bilgisi düşer.
alter table public.queue
  add column if not exists source_playlist_id uuid references public.playlists (id) on delete set null;

-- 7) RLS: okuma herkese açık (panel anon anahtarla okuyor), yazma service-role —
--    playlists/playlist_songs ile aynı güven modeli (bkz. 0026).
alter table public.playlist_rotation          enable row level security;
alter table public.playlist_rotation_consumed enable row level security;

drop policy if exists "playlist_rotation_public_read" on public.playlist_rotation;
create policy "playlist_rotation_public_read" on public.playlist_rotation
  for select to anon, authenticated using (true);

drop policy if exists "playlist_rotation_consumed_public_read" on public.playlist_rotation_consumed;
create policy "playlist_rotation_consumed_public_read" on public.playlist_rotation_consumed
  for select to anon, authenticated using (true);

-- 8) Realtime: paneldeki "şu an çalan liste — 12/40" göstergesi imleç değişince
--    kendiliğinden tazelensin. Tüketim tablosu YAYINA GİRMEZ: her şarkıda satır
--    eklenir, panele her seferinde olay göndermek gereksiz trafik olur; sayaç
--    imleç güncellemesiyle (updated_at her dolumda değişir) birlikte tazelenir.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlist_rotation'
    ) then
      alter publication supabase_realtime add table public.playlist_rotation;
    end if;
  end if;
end
$$;

commit;
