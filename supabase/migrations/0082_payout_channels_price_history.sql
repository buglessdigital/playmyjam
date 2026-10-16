-- 0082: Hakediş için fiyat/oran geçmişi + Apple (App Store) satış kanalı.
--
-- 1) Sözleşme (Hizmet ve Gelir Paylaşım Sözleşmesi md. 5) hakedişi şöyle tanımlar:
--      birim fiyat      → Dönem SONUNDA geçerli fiyat
--      kesinti oranları → değişiklik izleyen Dönemden itibaren, yani Dönem
--                         BAŞINDA geçerli oranlar
--    Önceden hesap, taslağın oluşturulduğu andaki güncel değerleri kullanıyordu;
--    ay kapandıktan sonra fiyat/oran değişirse eski dönem yanlış hesaplanırdı.
--    app_settings'teki ilgili anahtarların her değişikliği artık
--    app_settings_history'ye yazılır; kod dönemin değerini buradan okur.
--
-- 2) iOS'ta jeton Apple uygulama içi satın almayla satılacak (App Store kuralı
--    3.1.1). Apple'ın kesintisi iyzico'dan farklı olduğu için hakediş kanalı
--    bilmeli. Ücretli bakiyenin Apple'dan gelen kısmı ayrıca tutulur:
--      wallet_transactions.channel           : 'purchase' satırının kanalı ('iyzico' | 'apple'; null = iyzico)
--      user_wallets.apple_paid_balance       : paid_balance'ın Apple kısmı
--      wallet_transactions.apple_paid_amount : paid_amount'un Apple kısmı
--    Harcamada ücretli jeton (0057) iki kanal arasında ORANSAL düşülür: düşülen
--    ücretli jetonun Apple payı = ücretli bakiyedeki Apple payı. Apple satın
--    alma akışı yazılırken 'purchase' satırı channel = 'apple' ile eklenmeli.
--
-- Uygulama: npm run db:migrate -- --target staging, sonra --target prod.
-- Sıralama: ÖNCE bu SQL, SONRA kod (kod venue_payouts'un yeni kolonlarına yazar).

begin;

-- ── 1) Ayar geçmişi ──────────────────────────────────────────────────────────

create table if not exists public.app_settings_history (
  id           bigint generated always as identity primary key,
  key          text not null,
  value        jsonb not null,
  effective_at timestamptz not null default now()
);

create index if not exists app_settings_history_key_time
  on public.app_settings_history (key, effective_at desc);

alter table public.app_settings_history enable row level security;
-- Politika yok: yalnızca service_role okur/yazar

create or replace function public.app_settings_track_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Silinen ayar (ör. App Store fiyatı kaldırıldı) o andan sonra "tanımsız"
    if old.key in ('token_unit_price', 'apple_token_unit_price', 'payout_settings') then
      insert into public.app_settings_history (key, value) values (old.key, 'null'::jsonb);
    end if;
    return old;
  end if;
  if new.key in ('token_unit_price', 'apple_token_unit_price', 'payout_settings')
     and (tg_op = 'INSERT' or new.value is distinct from old.value) then
    insert into public.app_settings_history (key, value) values (new.key, new.value);
  end if;
  return new;
end
$$;

drop trigger if exists app_settings_track_history on public.app_settings;
create trigger app_settings_track_history
  after insert or update or delete on public.app_settings
  for each row execute function public.app_settings_track_history();

-- Bugünkü değerler geçmişin başlangıcı: daha önceki her dönem bu değerlerle
-- hesaplanır (açılış öncesi dönemler zaten test, hakediş oluşturulmuyor).
insert into public.app_settings_history (key, value, effective_at)
select s.key, s.value, '-infinity'::timestamptz
  from public.app_settings s
 where s.key in ('token_unit_price', 'apple_token_unit_price', 'payout_settings')
   and not exists (select 1 from public.app_settings_history h where h.key = s.key);

-- ── 2) Apple kanalı ──────────────────────────────────────────────────────────

alter table public.wallet_transactions
  add column if not exists channel text check (channel in ('iyzico', 'apple')),
  add column if not exists apple_paid_amount int not null default 0;

alter table public.user_wallets
  add column if not exists apple_paid_balance int not null default 0 check (apple_paid_balance >= 0);

-- 0057'deki tetikleyicinin kanal bilen hâli
create or replace function public.wallet_tx_track_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid  int;
  v_apple int;
begin
  new.apple_paid_amount := 0;
  if new.kind = 'purchase' then
    new.paid_amount := new.amount;
    if new.channel = 'apple' then
      new.apple_paid_amount := new.amount;
    end if;
    update public.user_wallets
       set paid_balance       = paid_balance + new.amount,
           apple_paid_balance = apple_paid_balance + new.apple_paid_amount
     where user_id = new.user_id;
  elsif new.kind = 'spend' then
    select paid_balance, apple_paid_balance into v_paid, v_apple
      from public.user_wallets
     where user_id = new.user_id
       for update;
    v_paid  := coalesce(v_paid, 0);
    v_apple := least(coalesce(v_apple, 0), v_paid);
    new.paid_amount := least(-new.amount, v_paid);
    if new.paid_amount > 0 then
      -- Oransal: ücretli bakiyenin tamamı harcanırsa Apple kısmı da tamamen düşer
      new.apple_paid_amount := least(v_apple, round(new.paid_amount::numeric * v_apple / v_paid)::int);
      update public.user_wallets
         set paid_balance       = paid_balance - new.paid_amount,
             apple_paid_balance = apple_paid_balance - new.apple_paid_amount
       where user_id = new.user_id;
    end if;
  else
    new.paid_amount := 0;
  end if;
  return new;
end
$$;

-- Mekan kullanımı: ücretli jetonun Apple kısmı da döner. Dönüş tipi değiştiği
-- için drop + create.
drop function if exists public.venue_token_usage(date, date);

create function public.venue_token_usage(p_from date, p_to date)
returns table (venue_id uuid, tokens bigint, paid_tokens bigint, apple_paid_tokens bigint, requests bigint, last_spend_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.venue_id,
         sum(-t.amount)::bigint           as tokens,
         sum(t.paid_amount)::bigint       as paid_tokens,
         sum(t.apple_paid_amount)::bigint as apple_paid_tokens,
         count(*)::bigint                 as requests,
         max(t.created_at)                as last_spend_at
    from public.wallet_transactions t
   where t.kind = 'spend'
     and t.venue_id is not null
     and t.created_at >= (p_from::timestamp at time zone 'Europe/Istanbul')
     and t.created_at <  (p_to::timestamp   at time zone 'Europe/Istanbul')
   group by t.venue_id;
$$;

revoke execute on function public.venue_token_usage(date, date) from public, anon, authenticated;

-- ── 3) Hakediş kaydında Apple kırılımı ──────────────────────────────────────
-- tokens: tüm ücretli jeton (Apple dahil); unit_price: web (iyzico) birim fiyatı;
-- bank_fee: yalnızca iyzico cirosundan; apple_fee: Apple cirosunun KDV hariç kısmından.

alter table public.venue_payouts
  add column if not exists apple_tokens     int           not null default 0,
  add column if not exists apple_unit_price numeric(10,2),
  add column if not exists apple_fee_pct    numeric(5,2)  not null default 0,
  add column if not exists apple_fee        numeric(12,2) not null default 0;

commit;
