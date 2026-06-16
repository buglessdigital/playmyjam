-- Jeton bakiyesi için atomik fonksiyonlar.
-- Uygulama: Supabase Dashboard > SQL Editor'da bu dosyayı çalıştırın.
-- Bu fonksiyonlar yalnızca service-role tarafından çağrılır (API rotaları).

-- add_tokens'ın upsert'i için benzersizlik şart
create unique index if not exists user_tokens_user_venue_uniq
  on public.user_tokens (user_id, venue_id);

-- Bakiye yeterliyse tek UPDATE ile düşer; yetersizse false döner.
-- Koşullu UPDATE atomik olduğundan eşzamanlı isteklerde çift harcama olamaz.
create or replace function public.spend_tokens(p_user_id uuid, p_venue_id uuid, p_amount int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_amount <= 0 then
    return false;
  end if;

  update public.user_tokens
     set balance = balance - p_amount
   where user_id = p_user_id
     and venue_id = p_venue_id
     and balance >= p_amount;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end
$$;

-- Bakiyeye jeton ekler (satın alma / iade); satır yoksa oluşturur. Yeni bakiyeyi döner.
create or replace function public.add_tokens(p_user_id uuid, p_venue_id uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then
    raise exception 'add_tokens: miktar pozitif olmalı';
  end if;

  insert into public.user_tokens (user_id, venue_id, balance)
       values (p_user_id, p_venue_id, p_amount)
  on conflict (user_id, venue_id)
       do update set balance = public.user_tokens.balance + excluded.balance
  returning balance into v_balance;

  return v_balance;
end
$$;

-- Bu fonksiyonları yalnızca service-role çağırabilsin
revoke execute on function public.spend_tokens(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.add_tokens(uuid, uuid, int) from public, anon, authenticated;
