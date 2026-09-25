-- 0057: Hakediş yalnızca ÜCRETLİ jetondan hesaplanır.
--
-- Cüzdan tek havuz olduğundan bir harcama satırı, düşülen jetonun parayla mı
-- (iyzico) yoksa bedava mı (grant / demo / iyzico öncesi simülasyon) alındığını
-- bilmiyordu; hakediş tüm harcamayı ciro sayıyordu. Artık:
--   user_wallets.paid_balance         : bakiyenin parayla alınmış kısmı
--   wallet_transactions.paid_amount   : satırın ücretli kısmı (yükleme: +, harcama: düşülen)
-- Harcamada ÖNCE ücretli jeton düşülür. Kayıt, ledger'a yazan her yolda ortak
-- olan BEFORE INSERT tetikleyicisiyle tutulur — jeton RPC'lerine dokunulmaz.
--
-- Geçmiş aynı kuralla yeniden oynatılır. 'purchase' satırı yalnızca başarılı bir
-- payment_orders siparişine denk geliyorsa ücretli sayılır (16 Tem 2026'daki
-- iyzico öncesi simülasyon satın alması bedava kalır).
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0056'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (kod, paid_tokens yokken eski
-- davranışa — tüm harcama — düşer).

begin;

-- Yeniden oynatma ile tetikleyici kurulumu arasında harcama/yükleme sızmasın
lock table public.wallet_transactions, public.user_wallets in share row exclusive mode;

alter table public.user_wallets
  add column if not exists paid_balance int not null default 0 check (paid_balance >= 0);

alter table public.wallet_transactions
  add column if not exists paid_amount int not null default 0;

-- 1) Yeni satırlar: tetikleyici ücretli kısmı hesaplar ve cüzdanı günceller
create or replace function public.wallet_tx_track_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid int;
begin
  if new.kind = 'purchase' then
    new.paid_amount := new.amount;
    update public.user_wallets
       set paid_balance = paid_balance + new.amount
     where user_id = new.user_id;
  elsif new.kind = 'spend' then
    select paid_balance into v_paid
      from public.user_wallets
     where user_id = new.user_id
       for update;
    new.paid_amount := least(-new.amount, coalesce(v_paid, 0));
    if new.paid_amount > 0 then
      update public.user_wallets
         set paid_balance = paid_balance - new.paid_amount
       where user_id = new.user_id;
    end if;
  else
    new.paid_amount := 0;
  end if;
  return new;
end
$$;

drop trigger if exists wallet_tx_track_paid on public.wallet_transactions;
create trigger wallet_tx_track_paid
  before insert on public.wallet_transactions
  for each row execute function public.wallet_tx_track_paid();

-- 2) Geçmiş: kullanıcı başına kronolojik yeniden oynatma
do $$
declare
  r record;
  v_user uuid := null;
  v_paid int := 0;
  v_amt int;
begin
  for r in
    select t.id, t.user_id, t.kind, t.amount,
           (t.kind = 'purchase' and exists (
              select 1 from public.payment_orders o
               where o.status = 'success'
                 and o.user_id = t.user_id
                 and o.tokens = t.amount
                 and o.updated_at between t.created_at - interval '5 minutes'
                                      and t.created_at + interval '5 minutes'
           )) as is_paid
      from public.wallet_transactions t
     order by t.user_id, t.created_at, t.id
  loop
    if v_user is distinct from r.user_id then
      if v_user is not null then
        update public.user_wallets set paid_balance = v_paid where user_id = v_user;
      end if;
      v_user := r.user_id;
      v_paid := 0;
    end if;

    v_amt := 0;
    if r.kind = 'purchase' and r.is_paid then
      v_amt := r.amount;
      v_paid := v_paid + r.amount;
    elsif r.kind = 'spend' then
      v_amt := least(-r.amount, v_paid);
      v_paid := v_paid - v_amt;
    end if;

    update public.wallet_transactions set paid_amount = v_amt where id = r.id;
  end loop;

  if v_user is not null then
    update public.user_wallets set paid_balance = v_paid where user_id = v_user;
  end if;
end
$$;

-- Ücretli bakiye toplam bakiyeyi aşamaz (ledger dışı bir düşüm olduysa)
update public.user_wallets set paid_balance = balance where paid_balance > balance;

-- 3) Mekan kullanımı: toplam harcamanın yanında ücretli kısım. Dönüş tipi
--    değiştiği için drop + create.
drop function if exists public.venue_token_usage(date, date);

create function public.venue_token_usage(p_from date, p_to date)
returns table (venue_id uuid, tokens bigint, paid_tokens bigint, requests bigint, last_spend_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.venue_id,
         sum(-t.amount)::bigint     as tokens,
         sum(t.paid_amount)::bigint as paid_tokens,
         count(*)::bigint           as requests,
         max(t.created_at)          as last_spend_at
    from public.wallet_transactions t
   where t.kind = 'spend'
     and t.venue_id is not null
     and t.created_at >= (p_from::timestamp at time zone 'Europe/Istanbul')
     and t.created_at <  (p_to::timestamp   at time zone 'Europe/Istanbul')
   group by t.venue_id;
$$;

revoke execute on function public.venue_token_usage(date, date) from public, anon, authenticated;

commit;
