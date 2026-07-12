-- Web Push abonelikleri: "şarkın çalıyor" bildirimi uygulama kapalıyken de ulaşsın.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0008'den SONRA çalıştırın.
--
-- Güven modeli: tüm okuma/yazma yalnızca service-role üzerinden (API rotaları).
-- İstemcilere hiçbir policy açılmaz — RLS açık, policy yok = anon/authenticated erişemez.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Push servisi URL'i; cihaz+tarayıcı başına tekildir
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
