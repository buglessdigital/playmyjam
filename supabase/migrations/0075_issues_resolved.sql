-- Sorunlar ekranında (0061) kayıtları toplu "çözüldü" işaretleme. Çözülen
-- kayıt listeden ve sekme sayılarından düşer; teslim oranları (göründü %,
-- cihaz yok…) ölçüm olduğu için çözülenleri de sayar.

alter table public.push_deliveries add column if not exists resolved_at timestamptz;
alter table public.system_events add column if not exists resolved_at timestamptz;

-- system_events'e service_role yalnız select/insert/delete almıştı
grant update (resolved_at) on public.system_events to service_role;

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
      'failed', count(*) filter (where status in ('failed', 'partial', 'not_configured')),
      -- "Sorunlu olanlar" süzgeciyle aynı tanım, çözülmemişler
      'open_problems', count(*) filter (
        where resolved_at is null and (
          status <> 'sent'
          or (shown_at is null and created_at < now() - interval '5 minutes')
        )
      )
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
      'warn', count(*) filter (where severity = 'warn'),
      'open', count(*) filter (where resolved_at is null)
    ) from e
  ),
  'events_by_area', coalesce((
    select jsonb_object_agg(area, n) from (
      select area, count(*) as n from e where resolved_at is null group by area
    ) s
  ), '{}'::jsonb)
);
$$;

revoke execute on function public.ops_summary(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ops_summary(uuid, timestamptz) to service_role;
