-- 0050: İş yönetimi — super admin paneli için CRM, sözleşme, hakediş ve görevler.
--
-- crm_leads        : görüşülen / görüşülecek aday mekanlar ve hattaki aşaması
-- crm_activities   : adaylarla yapılan her görüşmenin kaydı (telefon, ziyaret, demo…)
-- crm_tasks        : tarihli yapılacaklar; bir adaya ya da çalışan mekana bağlanabilir
-- venue_contracts  : çalışan mekanın komisyon oranı, ödeme günü ve banka/fatura bilgileri
-- venue_payouts    : aylık hakediş — o ay mekanda harcanan jetondan mekana ödenecek tutar
--
-- Jeton kullanımı wallet_transactions'tan (kind = 'spend') okunur; bu tablolar
-- yalnızca iş tarafını tutar, ödeme akışına dokunmaz.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0049'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (tablolar yokken yeni ekranlar 500 döner).

begin;

-- 1) Aday mekanlar
create table if not exists public.crm_leads (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  contact_name             text not null default '',
  contact_role             text not null default '',
  phone                    text not null default '',
  email                    text not null default '',
  city                     text not null default '',
  district                 text not null default '',
  address                  text not null default '',
  venue_type               text not null default '',
  instagram                text not null default '',
  source                   text not null default 'manual'
                             check (source in ('manual', 'application', 'referral', 'field', 'social', 'event', 'other')),
  stage                    text not null default 'lead'
                             check (stage in ('lead', 'contacted', 'meeting', 'demo', 'proposal',
                                              'negotiation', 'won', 'lost', 'on_hold')),
  priority                 text not null default 'normal'
                             check (priority in ('low', 'normal', 'high')),
  -- Kapasite, tahmini aylık jeton ve teklif edilen mekan komisyonu — teklif aşamasında dolar
  capacity                 int check (capacity is null or capacity >= 0),
  estimated_monthly_tokens int check (estimated_monthly_tokens is null or estimated_monthly_tokens >= 0),
  proposed_commission_pct  numeric(5,2) check (proposed_commission_pct is null or proposed_commission_pct between 0 and 100),
  lost_reason              text not null default '',
  next_action              text not null default '',
  next_action_at           timestamptz,
  notes                    text not null default '',
  application_id           uuid references public.venue_applications (id) on delete set null,
  venue_id                 uuid references public.venues (id) on delete set null,
  stage_changed_at         timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists crm_leads_stage_idx on public.crm_leads (stage, updated_at desc);
create index if not exists crm_leads_next_action_idx on public.crm_leads (next_action_at)
  where next_action_at is not null;
create unique index if not exists crm_leads_application_uidx on public.crm_leads (application_id)
  where application_id is not null;

-- 2) Görüşme kayıtları
create table if not exists public.crm_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.crm_leads (id) on delete cascade,
  kind        text not null
                check (kind in ('call', 'meeting', 'visit', 'whatsapp', 'email', 'demo', 'note', 'stage_change')),
  summary     text not null,
  outcome     text not null default '',
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists crm_activities_lead_idx on public.crm_activities (lead_id, occurred_at desc);

-- 3) Görevler
create table if not exists public.crm_tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  details    text not null default '',
  lead_id    uuid references public.crm_leads (id) on delete cascade,
  venue_id   uuid references public.venues (id) on delete cascade,
  due_at     timestamptz,
  priority   text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_tasks_open_idx on public.crm_tasks (done, due_at);

-- 4) Mekan sözleşmesi (mekan başına tek satır)
create table if not exists public.venue_contracts (
  venue_id       uuid primary key references public.venues (id) on delete cascade,
  -- Mekan komisyonu: kesintiler (KDV + banka komisyonu + ek kesinti) düşüldükten
  -- sonra kalan net cironun yüzde kaçı mekana ödenir
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  -- Dönem ayı kapandıktan sonraki ayın kaçında ödenir
  payment_day    int not null default 15 check (payment_day between 1 and 28),
  start_date     date,
  end_date       date,
  legal_name     text not null default '',
  tax_office     text not null default '',
  tax_number     text not null default '',
  iban           text not null default '',
  account_holder text not null default '',
  billing_email  text not null default '',
  contact_name   text not null default '',
  contact_phone  text not null default '',
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 5) Aylık hakediş
create table if not exists public.venue_payouts (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid references public.venues (id) on delete set null,
  -- Mekan silinse de muhasebe kaydı okunur kalsın
  venue_name       text not null,
  period_start     date not null,  -- ayın ilk günü
  period_end       date not null,  -- sonraki ayın ilk günü (hariç)
  tokens           int not null default 0,
  -- Hesap anındaki oranların kopyası: ayar sonradan değişse de döküm bozulmaz
  unit_price       numeric(10,2) not null,
  gross_amount     numeric(12,2) not null,  -- tokens × unit_price (KDV dahil ciro)
  vat_rate         numeric(5,2)  not null,
  vat_amount       numeric(12,2) not null,
  bank_fee_pct     numeric(5,2)  not null,
  bank_fee         numeric(12,2) not null,
  other_pct        numeric(5,2)  not null default 0,
  other_amount     numeric(12,2) not null default 0,
  net_amount       numeric(12,2) not null,  -- gross − KDV − banka − ek kesinti
  commission_pct   numeric(5,2)  not null,
  computed_amount  numeric(12,2) not null,  -- net × commission_pct
  adjustment       numeric(12,2) not null default 0,
  adjustment_note  text not null default '',
  amount           numeric(12,2) generated always as (computed_amount + adjustment) stored,
  due_date         date not null,
  status           text not null default 'draft'
                     check (status in ('draft', 'approved', 'paid', 'cancelled')),
  paid_at          date,
  payment_ref      text not null default '',
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (venue_id, period_start)
);

create index if not exists venue_payouts_period_idx on public.venue_payouts (period_start desc);
create index if not exists venue_payouts_status_idx on public.venue_payouts (status, due_date);

-- Hakediş sorgusu mekan + tarih aralığıyla tarar
create index if not exists wallet_transactions_venue_spend_idx
  on public.wallet_transactions (venue_id, created_at)
  where kind = 'spend';

-- Hakediş kesinti oranları (panelden değişir). KDV, KDV dahil fiyattan ayrıştırılır;
-- banka komisyonu ve ek kesinti brüt ciro üzerinden hesaplanır.
insert into public.app_settings (key, value, updated_at)
values ('payout_settings', '{"vat_rate": 20, "bank_fee_pct": 0, "other_pct": 0}'::jsonb, now())
on conflict (key) do nothing;

-- 6) Mekan bazında jeton kullanımı — [p_from, p_to) günleri, İstanbul saatiyle.
create or replace function public.venue_token_usage(p_from date, p_to date)
returns table (venue_id uuid, tokens bigint, requests bigint, last_spend_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.venue_id,
         sum(-t.amount)::bigint as tokens,
         count(*)::bigint       as requests,
         max(t.created_at)      as last_spend_at
    from public.wallet_transactions t
   where t.kind = 'spend'
     and t.venue_id is not null
     and t.created_at >= (p_from::timestamp at time zone 'Europe/Istanbul')
     and t.created_at <  (p_to::timestamp   at time zone 'Europe/Istanbul')
   group by t.venue_id;
$$;

revoke execute on function public.venue_token_usage(date, date) from public, anon, authenticated;

-- 7) Başarılı jeton satışları toplamı — [p_from, p_to) günleri, İstanbul saatiyle.
create or replace function public.token_sales_total(p_from date, p_to date)
returns table (orders bigint, tokens bigint, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(o.tokens), 0)::bigint,
         coalesce(sum(o.total), 0)
    from public.payment_orders o
   where o.status = 'success'
     and o.created_at >= (p_from::timestamp at time zone 'Europe/Istanbul')
     and o.created_at <  (p_to::timestamp   at time zone 'Europe/Istanbul');
$$;

revoke execute on function public.token_sales_total(date, date) from public, anon, authenticated;

-- Tablolar istemciye tamamen kapalı: politika YOK, erişim yalnızca
-- super admin route handler'larından (service-role).
alter table public.crm_leads       enable row level security;
alter table public.crm_activities  enable row level security;
alter table public.crm_tasks       enable row level security;
alter table public.venue_contracts enable row level security;
alter table public.venue_payouts   enable row level security;

commit;
