-- Hasat turlarının ilerlemesi: super admin "Katalog" ekranındaki durum çubuğu.
--
-- Neden: hasat (scripts/seed-catalog.ts) geliştiricinin makinesinde çalışan elle
-- bir betik. Bitirdiği listeleri catalog_sources'a yazıyor ama "kaç listeden
-- kaçı bitti, ne kadar kota harcandı, şu an hangi liste okunuyor" hiçbir yerde
-- durmuyordu — tur ancak terminal çıktısından izlenebiliyordu. Bu tablo o
-- durumu paylaşılan yere taşıyor, böylece ekran turu canlı gösterebiliyor.
--
-- Satırlar birikir (tur geçmişi); tek satırlık "şu anki durum" tutulmuyor,
-- çünkü hangi turun ne getirdiğini sonradan karşılaştırmak işin kendisi kadar
-- değerli: 30 Eyl'de aynı bütçe 935 ve 9.190 şarkı getirdi.

create table if not exists public.catalog_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- running: betik çalışıyor · done: sıra tükendi · budget/quota: sınır doldu
  -- error: hata · stale: betik öldü (kullanıcı makinesi kapandı, sık oluyor)
  status text not null default 'running'
    check (status in ('running', 'done', 'budget', 'quota', 'error', 'stale')),
  budget integer not null default 0,
  units_spent integer not null default 0,
  lists_total integer not null default 0,
  lists_done integer not null default 0,
  lists_deferred integer not null default 0,
  songs_added integer not null default 0,
  -- okunmakta olan liste: ekranda "şu an ... okunuyor" satırı
  current_list text,
  -- betiğin son yaşam belirtisi: finished_at boş ama bu bayatsa tur ölmüştür
  heartbeat_at timestamptz not null default now(),
  note text
);

create index if not exists catalog_runs_started_idx on public.catalog_runs (started_at desc);

alter table public.catalog_runs enable row level security;
revoke all on public.catalog_runs from anon, authenticated;
grant select, insert, update on public.catalog_runs to service_role;
