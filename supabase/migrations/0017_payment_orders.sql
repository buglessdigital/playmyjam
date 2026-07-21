-- iyzico Checkout Form entegrasyonu: ödeme siparişleri + onaylandığında atomik
-- jeton kredisi. Jeton artık sadece iyzico'nun geri çağrısı (callback) doğrulandıktan
-- sonra eklenir — istek anında değil.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0016'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (yeni checkout route bu tabloya
-- ve confirm_payment_order fonksiyonuna bağımlı).

begin;

-- 1) Sipariş tablosu: her ödeme denemesi bir satır. status='pending' olarak
--    başlar, iyzico callback'i doğrulandığında 'success' veya 'failed' olur.
create table if not exists public.payment_orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  venue_id          uuid references public.venues (id) on delete set null,
  tokens            int not null check (tokens > 0),
  total             numeric(10,2) not null check (total > 0),
  status            text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  buyer             jsonb not null,  -- ad/soyad/TC kimlik no/şehir (muhasebe/uyum kaydı)
  iyzico_payment_id text,
  raw_response      jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);

alter table public.payment_orders enable row level security;

-- Kullanıcı yalnızca kendi siparişlerini görür; yazma yok (RPC/service-role)
drop policy if exists "payment_orders_own_read" on public.payment_orders;
create policy "payment_orders_own_read" on public.payment_orders
  for select to authenticated using (auth.uid() = user_id);

-- 2) confirm_payment_order: iyzico callback'i "SUCCESS" doğruladığında çağrılır.
--    Atomik guard (`where status = 'pending'`): iyzico aynı callback'i birden
--    fazla POST edebilir — ikinci çağrıda satır bulunamaz, false döner, jeton
--    tekrar eklenmez.
create function public.confirm_payment_order(
  p_order_id uuid,
  p_iyzico_payment_id text,
  p_raw jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders;
begin
  update public.payment_orders
     set status = 'success',
         iyzico_payment_id = p_iyzico_payment_id,
         raw_response = p_raw,
         updated_at = now()
   where id = p_order_id
     and status = 'pending'
  returning * into v_order;

  if not found then
    return false;
  end if;

  perform public.add_tokens(v_order.user_id, v_order.tokens, v_order.venue_id, 'purchase');

  return true;
end
$$;

revoke execute on function public.confirm_payment_order(uuid, text, jsonb) from public, anon, authenticated;

commit;
