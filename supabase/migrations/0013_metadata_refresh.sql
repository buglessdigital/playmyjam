-- YouTube API veri saklama uyumu (Developer Policy III.E.4): songs metadata'sı
-- 30 günde bir tazelenmeli. Cron (/api/cron/youtube-refresh) bu kolona bakarak
-- en eski tazelenenden başlar.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0012'den SONRA çalıştırın.

begin;

alter table public.songs
  add column if not exists metadata_refreshed_at timestamptz not null default now();

-- Mevcut satırların metadata'sı eklenme tarihinden beri hiç tazelenmedi —
-- 31 gün geriye çekilir ki cron ilk çalışmalardan itibaren hepsini sıraya alsın
update public.songs set metadata_refreshed_at = now() - interval '31 days';

create index if not exists songs_metadata_refreshed_at_idx
  on public.songs (metadata_refreshed_at);

commit;
