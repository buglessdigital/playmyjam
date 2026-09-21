-- Günlük "yeni çıkanlar" turu (app/api/cron/catalog-new) için durum.
--
-- Hasat betiği (scripts/seed-catalog.ts) listelerin son görülen şarkı sayısını
-- yerel bir JSON dosyasında tutuyor; cron'un dosya sistemi kalıcı değil, bu
-- yüzden aynı bilgi burada. Sayı değişmemiş liste açılmaz: 1.500 kanalın ön
-- kontrolü günde ~30 birim.

create table if not exists public.catalog_sources (
  playlist_id text primary key,
  item_count integer not null,
  checked_at timestamptz not null default now()
);

alter table public.catalog_sources enable row level security;
revoke all on public.catalog_sources from anon, authenticated;
grant select, insert, update, delete on public.catalog_sources to service_role;

-- Havuzdaki "Sanatçı - Topic" kanallarının yükleme listeleri (UC -> UU, sıfır
-- kota). songs'u istemciden sayfalamak 265 bin satırda ~270 istek sürüyordu.
-- Tek dizi döner: tablo dönseydi PostgREST yanıtı 1.000 satırda keserdi ve
-- her sayfa taramayı baştan yapardı (tek tarama ~4 sn, API rolünün sınırı 8 sn).
-- Kısmi indeks taramayı index-only'ye çevirir.
create index if not exists songs_topic_channel_idx
  on public.songs (channel_id)
  where channel_title ilike '%- Topic';

drop function if exists public.catalog_topic_uploads();
create function public.catalog_topic_uploads()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct 'UU' || substr(channel_id, 3)), '{}')
  from public.songs
  where channel_title ilike '%- Topic'
    and channel_id like 'UC%'
$$;

revoke all on function public.catalog_topic_uploads() from public, anon, authenticated;
grant execute on function public.catalog_topic_uploads() to service_role;
