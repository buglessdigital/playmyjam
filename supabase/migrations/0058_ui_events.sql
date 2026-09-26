-- Müşteri paneli arayüz analizi: super admin mekan mekan "müşteri nereye
-- tıklıyor, nerede takılıyor, nereden çıkıyor" sorularına bakabilsin diye.
--
-- Anonim: kullanıcı kimliği, IP ya da girilen metin YOK. session_id sekme
-- başına rastgele üretilir (30 dk hareketsizlikte yenilenir), hesaba bağlanmaz.
--
-- kind 'view'   : sayfa görüntüleme (page normalize: /browse, /song/:id ...)
-- kind 'click'  : tıklama. dead = etkileşimli olmayan yere tıklama,
--                 rage = aynı noktaya kısa sürede art arda (3+) tıklama.
--                 x / vy ekrana göre binde (0-1000), py sayfa başından piksel.
-- kind 'action' : uygulamanın bildirdiği sonuç (song_added, checkout_started…)
-- Yazan: app/api/ui-events (service_role). Okuyan: super admin RPC'leri.

create table if not exists public.ui_events (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues(id) on delete cascade,
  at timestamptz not null default now(),
  session_id text not null,
  kind text not null check (kind in ('view', 'click', 'action')),
  page text not null,
  target text,
  sel text,
  dead boolean not null default false,
  rage boolean not null default false,
  x smallint,
  vy smallint,
  py integer,
  detail jsonb
);

create index if not exists ui_events_venue_at_idx on public.ui_events (venue_id, at desc);
create index if not exists ui_events_at_idx on public.ui_events (at);

alter table public.ui_events enable row level security;
revoke all on public.ui_events from anon, authenticated;
grant select, insert, delete on public.ui_events to service_role;

-- Bütün özet tek turda: PostgREST'in satır tavanına (1000) takılmamak için
-- toplama veritabanında yapılır, tek jsonb döner. p_venue null = tüm mekanlar.
create or replace function public.ui_analytics(p_venue uuid, p_since timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
with ev as (
  select * from ui_events
  where at >= p_since and (p_venue is null or venue_id = p_venue)
),
views as (
  select session_id, page, at,
    lead(page) over w as next_page,
    lead(at) over w as next_at,
    row_number() over w as rn,
    count(*) over (partition by session_id) as n
  from ev where kind = 'view'
  window w as (partition by session_id order by at, id)
),
sess as (
  select session_id,
    min(at) as started,
    max(at) as ended,
    count(*) filter (where kind = 'view') as views,
    count(*) filter (where kind = 'click') as clicks,
    bool_or(kind = 'view' and page = '/browse') as saw_browse,
    bool_or(kind = 'view' and page = '/tokens') as saw_tokens,
    bool_or(kind = 'action' and target = 'song_added') as added,
    bool_or(kind = 'action' and target in ('song_requested', 'suggestion_sent')) as requested,
    bool_or(kind = 'action' and target = 'checkout_started') as checkout
  from ev group by session_id
),
first_view as (
  select distinct on (session_id) session_id, detail
  from ev where kind = 'view'
  order by session_id, at, id
)
select jsonb_build_object(
  'totals', (
    select jsonb_build_object(
      'sessions', count(*),
      'views', coalesce(sum(views), 0),
      'clicks', coalesce(sum(clicks), 0),
      'avg_session_seconds', coalesce(round(avg(least(extract(epoch from ended - started), 7200))), 0),
      'bounce', count(*) filter (where views <= 1 and clicks = 0),
      'dead', (select count(*) from ev where kind = 'click' and dead),
      'rage', (select count(*) from ev where kind = 'click' and rage),
      -- Öfke tıklaması çoğu kez aynı zamanda ölüdür: sorunlu = ikisinden biri
      'problem', (select count(*) from ev where kind = 'click' and (dead or rage))
    ) from sess
  ),
  'funnel', (
    select jsonb_build_object(
      'sessions', count(*),
      'interacted', count(*) filter (where clicks > 0),
      'browse', count(*) filter (where saw_browse),
      'added', count(*) filter (where added),
      'requested', count(*) filter (where requested),
      'tokens', count(*) filter (where saw_tokens),
      'checkout', count(*) filter (where checkout)
    ) from sess
  ),
  'pages', coalesce((
    select jsonb_agg(p order by (p->>'views')::int desc) from (
      select jsonb_build_object(
        'page', v.page,
        'views', count(*),
        'sessions', count(distinct v.session_id),
        'avg_seconds', round(avg(least(extract(epoch from v.next_at - v.at), 1800)) filter (where v.next_at is not null)),
        'entries', count(*) filter (where v.rn = 1),
        'exits', count(*) filter (where v.rn = v.n),
        'clicks', coalesce(max(c.clicks), 0),
        'dead', coalesce(max(c.dead), 0),
        'rage', coalesce(max(c.rage), 0),
        'problem', coalesce(max(c.problem), 0)
      ) as p
      from views v
      left join (
        select page, count(*) as clicks,
          count(*) filter (where dead) as dead,
          count(*) filter (where rage) as rage,
          count(*) filter (where dead or rage) as problem
        from ev where kind = 'click' group by page
      ) c on c.page = v.page
      group by v.page
    ) s
  ), '[]'::jsonb),
  'targets', coalesce((
    select jsonb_agg(t order by (t->>'clicks')::int desc) from (
      select jsonb_build_object(
        'page', page, 'target', target, 'sel', sel,
        'clicks', count(*),
        'sessions', count(distinct session_id),
        'dead', count(*) filter (where dead),
        'rage', count(*) filter (where rage)
      ) as t
      from ev where kind = 'click'
      group by page, target, sel
      order by count(*) desc
      limit 400
    ) s
  ), '[]'::jsonb),
  'flows', coalesce((
    select jsonb_agg(f order by (f->>'n')::int desc) from (
      select jsonb_build_object('from', page, 'to', next_page, 'n', count(*)) as f
      from views
      where next_page is not null and next_page <> page
      group by page, next_page
      order by count(*) desc
      limit 40
    ) s
  ), '[]'::jsonb),
  'actions', coalesce((
    select jsonb_object_agg(target, n) from (
      select target, count(*) as n from ev where kind = 'action' group by target
    ) s
  ), '{}'::jsonb),
  'hours', coalesce((
    select jsonb_object_agg(h, n) from (
      select extract(hour from started at time zone 'Europe/Istanbul')::int as h, count(*) as n
      from sess group by 1
    ) s
  ), '{}'::jsonb),
  'days', coalesce((
    select jsonb_agg(jsonb_build_object('day', d, 'sessions', n) order by d) from (
      select (started at time zone 'Europe/Istanbul')::date as d, count(*) as n
      from sess group by 1
    ) s
  ), '[]'::jsonb),
  'devices', (
    select jsonb_build_object(
      'pwa', count(*) filter (where (detail->>'pwa')::boolean),
      'browser', count(*) filter (where not coalesce((detail->>'pwa')::boolean, false)),
      'en', count(*) filter (where detail->>'lang' = 'en'),
      'narrow', count(*) filter (where (detail->>'w')::int < 360),
      'phone', count(*) filter (where (detail->>'w')::int between 360 and 767),
      'wide', count(*) filter (where (detail->>'w')::int >= 768)
    ) from first_view
  )
);
$$;

-- Isı haritası: seçili sayfanın tıklamaları kutulara toplanır.
-- p_mode 'screen' = ekrana göre (x, vy binde), 'page' = sayfa boyunca (py piksel).
-- p_filter 'all' | 'dead' | 'rage'.
create or replace function public.ui_heatmap(
  p_venue uuid, p_since timestamptz, p_page text, p_mode text, p_filter text
)
returns jsonb
language sql
stable
set search_path = public
as $$
with c as (
  select x, vy, py from ui_events
  where kind = 'click' and page = p_page and at >= p_since
    and (p_venue is null or venue_id = p_venue)
    and x is not null
    and (p_filter = 'all' or (p_filter = 'dead' and dead) or (p_filter = 'rage' and rage))
),
bins as (
  select (x / 10) * 10 + 5 as bx,
    case when p_mode = 'page' then (py / 12) * 12 + 6 else (vy / 10) * 10 + 5 end as by,
    count(*) as n
  from c
  where (p_mode = 'page' and py is not null) or (p_mode <> 'page' and vy is not null)
  group by 1, 2
  order by 3 desc
  limit 6000
)
select jsonb_build_object(
  'points', coalesce((select jsonb_agg(jsonb_build_array(bx, by, n)) from bins), '[]'::jsonb),
  'total', (select count(*) from c),
  'max_py', (select coalesce(max(py), 0) from c),
  'sample_path', (
    select detail->>'path' from ui_events
    where kind = 'view' and page = p_page and at >= p_since
      and (p_venue is null or venue_id = p_venue)
      and detail ? 'path'
    order by at desc limit 1
  )
);
$$;

revoke execute on function public.ui_analytics(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.ui_heatmap(uuid, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.ui_analytics(uuid, timestamptz) to service_role;
grant execute on function public.ui_heatmap(uuid, timestamptz, text, text, text) to service_role;
