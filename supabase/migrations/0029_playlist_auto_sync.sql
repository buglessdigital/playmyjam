-- 0029: YouTube playlist'lerinin günlük otomatik senkronu.
--
-- 0026'da içe aktarım tek seferlikti: playlist YouTube'dan çekilip bırakılıyordu,
-- kaynağın kim olduğu hiçbir yere yazılmıyordu. Bu tablo o bağı kuruyor.
--
-- Kota mantığı (YouTube Data API günlük 10.000 birim):
--   1. Cron önce "bu listede kaç şarkı var" diye sorar — playlists.list, 50 liste
--      tek çağrıda, yani 1 birim. Sayı last_item_count ile aynıysa liste HİÇ açılmaz.
--   2. Sayı değiştiyse playlistItems.list ile sayfa sayfa okunur (50 şarkı = 1 birim).
--   3. Yeni video kimlikleri snapshot_video_ids ile karşılaştırılarak bulunur —
--      bu adım tamamen yerel, ek kota yemez.
--   4. videos.list yalnızca songs tablosunda HİÇ olmayan videolar için atılır.
-- Tipik gün: ~20 birim. Ayrıntı: docs yok, mantık lib/playlist-sync.ts'te.
--
-- snapshot_video_ids neden playlist_songs'tan ayrı duruyor:
--   Mekan bir şarkıyı panelden elle sildiğinde o şarkı YouTube listesinde durmaya
--   devam eder. Fark playlist_songs üzerinden alınsaydı şarkı ertesi gün "yeni"
--   sayılıp geri gelirdi — her gün. Snapshot kaynağın son görülen halini tutar,
--   bu yüzden elle silinen şarkı bir daha dönmez.
--
-- Silme davranışı: YouTube listesinden çıkarılan şarkı PMJ'den DÜŞMEZ. Yalnızca
-- snapshot'tan düşer (tekrar eklenirse yeniden gelir). Mekanın play_count'u ve
-- elle yaptığı düzenlemeler korunur.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0028'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u.

begin;

create table if not exists public.playlist_sources (
  playlist_id         uuid primary key references public.playlists (id) on delete cascade,
  venue_id            uuid not null references public.venues (id) on delete cascade,
  youtube_playlist_id text not null,
  -- Otomatik senkron kapalıyken de satır durur: kaynak URL hatırlanır, mekan
  -- anahtarı açtığında yeniden yapıştırmak gerekmez.
  auto_sync           boolean not null default false,
  -- Kaynağın son görülen hali: embed'e kapalı/silinmiş videolar dahil TÜM kimlikler.
  -- Filtrelenenler de burada durmalı, yoksa her gün yeniden denenirler.
  snapshot_video_ids  text[] not null default '{}',
  -- playlists.list'ten gelen ham sayı (silinmiş/gizli videolar dahil) — bu yüzden
  -- snapshot uzunluğuyla eşit olmak zorunda değil.
  last_item_count     int,
  last_synced_at      timestamptz,
  last_added          int not null default 0,
  -- Üst üste değişmeyen kontrol sayısı: uyuyan listeler 1 → 2 → 4 → 7 gün
  -- aralıklarla yoklanır, her gün boşuna sorgulanmaz.
  unchanged_streak    int not null default 0,
  next_check_at       timestamptz not null default now(),
  fail_count          int not null default 0,
  last_error          text,
  created_at          timestamptz not null default now()
);

-- Aynı YouTube listesini birden çok mekan içe aktarmış olabilir; cron kaynak
-- bazında gruplayıp bir kez okur, sonucu tüm mekanlara dağıtır.
create index if not exists playlist_sources_youtube_idx
  on public.playlist_sources (youtube_playlist_id);

-- Cron'un sıra kuyruğu: bütçe dolarsa kalanlar ertesi güne devreder
create index if not exists playlist_sources_due_idx
  on public.playlist_sources (next_check_at)
  where auto_sync;

create index if not exists playlist_sources_venue_idx
  on public.playlist_sources (venue_id);

-- RLS: okuma herkese açık (panel anon anahtarla senkron durumunu gösteriyor),
-- yazma yalnızca service-role — playlists/playlist_songs ile aynı model (bkz. 0026).
alter table public.playlist_sources enable row level security;

drop policy if exists "playlist_sources_public_read" on public.playlist_sources;
create policy "playlist_sources_public_read" on public.playlist_sources
  for select to anon, authenticated using (true);

-- Realtime: panelde senkron rozetleri anında güncellensin
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlist_sources'
    ) then
      alter publication supabase_realtime add table public.playlist_sources;
    end if;
  end if;
end
$$;

commit;
