-- 0077: Mağaza uygulaması (Capacitor) push cihaz kodları.
--
-- Web push (push_subscriptions, VAPID) uygulamanın WebView'inde çalışmıyor;
-- uygulama işletim sisteminin push'unu kullanır. Android'de FCM kayıt kodu,
-- iOS'ta APNs cihaz kodu gelir. Sunucu müşteri bildirimlerini web
-- aboneliklerine ve bu kodlara AYNI gönderimde yollar (lib/push.ts — tek
-- push_deliveries satırı).
--
-- iOS kodları şimdilik yalnızca SAKLANIR, gönderilmez: APNs anahtarı ücretli
-- Apple hesabıyla alınacak (bkz. docs/notlar/pmj-mobil-uygulama-2026-10.md).
--
-- Kod cihaza aittir, kullanıcıya değil: aynı telefonda başka hesaba geçilirse
-- satır yeni kullanıcıya taşınır (token unique + upsert). Misafir mevcut
-- hesaba birleşince (0071) uygulama kodu yeniden kaydeder, satır kendiliğinden
-- doğru kullanıcıya geçer.
--
-- Yazma/okuma yalnızca sunucudan (service_role): /api/push/native.
-- Uygulama: ÖNCE bu SQL, SONRA kod.

begin;

create table if not exists public.native_push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null check (platform in ('android', 'ios')),
  token      text not null unique check (length(token) between 16 and 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_push_tokens_user_idx on public.native_push_tokens (user_id);

alter table public.native_push_tokens enable row level security;
revoke all on public.native_push_tokens from anon, authenticated;

commit;
