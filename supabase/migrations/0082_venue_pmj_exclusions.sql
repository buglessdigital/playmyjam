-- 0082: Mekanın PMJ listesinden çıkardığı şarkılar.
--
-- PMJ listeleri abonelikle çalışır (0081): PMJ listeyi güncelledikçe açan her
-- mekanın bağlı listesi PMJ'nin içeriğine eşitlenir. Mekan panelden bir şarkıyı
-- "bu listeden çıkar" dediğinde üyeliği silmek yetmez — bir sonraki eşitlemede
-- geri gelirdi. Çıkarılan şarkı burada tutulur, eşitleme bunları atlar.
--
-- Satır yalnızca o mekan + o PMJ listesi için geçerli: aynı şarkı başka bir PMJ
-- listesinde ya da mekanın kendi listesinde durmaya devam eder. Geri alınınca
-- satır silinir ve şarkı bir sonraki eşitlemede (hemen) geri gelir.
--
-- Okuma/yazma yalnızca sunucudan (service-role) — mekan paneli API'den okur.
-- drop'suz yazıldı: Supabase MCP'si drop/delete içeren SQL'i ayrıca onaya bağlıyor.

begin;

create table if not exists public.venue_pmj_exclusions (
  venue_id        uuid not null references public.venues (id) on delete cascade,
  pmj_playlist_id uuid not null references public.pmj_playlists (id) on delete cascade,
  song_id         uuid not null references public.songs (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (venue_id, pmj_playlist_id, song_id)
);

alter table public.venue_pmj_exclusions enable row level security;

commit;
