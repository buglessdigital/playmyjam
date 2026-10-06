-- Super admin "Sorunlar" ekranı: mekana verdiğimiz sistemde sessizce ters
-- giden her şeyi görebilelim diye iki kayıt.
--
-- 1) push_deliveries — her bildirim denemesi TEK satır (bir kişiye / bir
--    mekanın adminlerine giden bir bildirim). Eskiden gönderim hataları ve
--    "cihazı yok" durumları hiç iz bırakmadan yutuluyordu.
--      status 'sent'           : en az bir cihaza push servisi kabul etti
--             'partial'        : bazı cihazlar kabul etti, bazıları reddetti
--             'failed'         : hiçbir cihaz kabul etmedi (hata metni error'da)
--             'no_device'      : alıcının kayıtlı cihazı yok (izin vermemiş,
--                                aboneliği düşmüş) — en sık "bildirim gelmedi"
--             'not_configured' : sunucuda VAPID anahtarı yok
--    shown_at / clicked_at: service worker bildirimi gösterince / dokunulunca
--    /api/push/ack ile işaretler. "sent" yalnızca Google/Apple'ın kabul ettiği
--    anlamına gelir; telefonda göründüğünün kanıtı shown_at'tir.
--
-- 2) system_events — sunucunun yakalayıp yuttuğu hatalar (ödeme, cron,
--    bildirim hazırlığı, yakalanmamış istek hataları...). venue_events'ten
--    (0055) ayrı: mekana bağlı olmayan olaylar da (cron) burada durur.
--
-- Yazan: lib/push.ts, lib/ops-log.ts (service_role). Okuyan: super admin API.
-- Saklama: 30 gün (app/api/cron/youtube-refresh siler).

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  venue_id uuid references public.venues(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{1,40}$'),
  audience text not null check (audience in ('customer', 'admin')),
  -- profiles.id (customer) ya da venue_admins.id; mekanın tüm adminlerine
  -- giden bildirimde boş
  recipient_id uuid,
  status text not null check (status in ('sent', 'partial', 'failed', 'no_device', 'not_configured')),
  devices smallint not null default 0,
  accepted smallint not null default 0,
  expired smallint not null default 0,
  failed smallint not null default 0,
  error text,
  title text,
  shown_at timestamptz,
  clicked_at timestamptz
);

create index if not exists push_deliveries_created_idx on public.push_deliveries (created_at desc);
create index if not exists push_deliveries_venue_created_idx on public.push_deliveries (venue_id, created_at desc);

alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant select, insert, update, delete on public.push_deliveries to service_role;

create table if not exists public.system_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  venue_id uuid references public.venues(id) on delete cascade,
  area text not null check (area ~ '^[a-z_]{1,24}$'),
  kind text not null check (kind ~ '^[a-z_]{1,40}$'),
  severity text not null check (severity in ('warn', 'error')),
  message text not null,
  detail jsonb
);

create index if not exists system_events_at_idx on public.system_events (at desc);
create index if not exists system_events_venue_at_idx on public.system_events (venue_id, at desc);

alter table public.system_events enable row level security;
revoke all on public.system_events from anon, authenticated;
grant select, insert, delete on public.system_events to service_role;

-- Ekranın özet sayıları tek turda: PostgREST'in 1000 satır tavanına takılmadan
-- (günde yüzlerce "şarkın çalıyor" bildirimi olabilir). p_venue null = tümü.
-- "Doğrulanmadı": kabul edildi ama 5 dk içinde gösterim onayı gelmedi.
create or replace function public.ops_summary(p_venue uuid, p_since timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
with d as (
  select * from push_deliveries
  where created_at >= p_since and (p_venue is null or venue_id = p_venue)
),
e as (
  select * from system_events
  where at >= p_since and (p_venue is null or venue_id = p_venue)
)
select jsonb_build_object(
  'push', (
    select jsonb_build_object(
      'total', count(*),
      'sent', count(*) filter (where status in ('sent', 'partial')),
      'shown', count(*) filter (where shown_at is not null),
      'clicked', count(*) filter (where clicked_at is not null),
      'unconfirmed', count(*) filter (
        where status in ('sent', 'partial') and shown_at is null
          and created_at < now() - interval '5 minutes'
      ),
      'no_device', count(*) filter (where status = 'no_device'),
      'failed', count(*) filter (where status in ('failed', 'partial', 'not_configured'))
    ) from d
  ),
  'push_by_kind', coalesce((
    select jsonb_agg(k order by (k->>'total')::int desc) from (
      select jsonb_build_object(
        'kind', kind,
        'audience', audience,
        'total', count(*),
        'sent', count(*) filter (where status in ('sent', 'partial')),
        'shown', count(*) filter (where shown_at is not null),
        'no_device', count(*) filter (where status = 'no_device'),
        'failed', count(*) filter (where status in ('failed', 'partial', 'not_configured'))
      ) as k
      from d group by kind, audience
    ) s
  ), '[]'::jsonb),
  'events', (
    select jsonb_build_object(
      'total', count(*),
      'error', count(*) filter (where severity = 'error'),
      'warn', count(*) filter (where severity = 'warn')
    ) from e
  ),
  'events_by_area', coalesce((
    select jsonb_object_agg(area, n) from (
      select area, count(*) as n from e group by area
    ) s
  ), '{}'::jsonb)
);
$$;

revoke execute on function public.ops_summary(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ops_summary(uuid, timestamptz) to service_role;
