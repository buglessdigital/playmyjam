-- Jeton hareketleri (ledger): her yükleme/harcama mekan ve şarkı bağlamıyla
-- kayda geçer; müşteri tokens sayfasında "Son Hareketler" olarak görür.
-- Geçmişe dönük veri yok — ledger bu migration'dan itibaren dolar.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0011'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (eski kod default parametrelerle
-- kesintisiz çalışır; yalnız yeni "Son Hareketler" UI'ı bu SQL'i bekler).

begin;

-- 1) Ledger tablosu
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  venue_id      uuid references public.venues (id) on delete set null,
  song_id       uuid references public.songs (id) on delete set null,
  amount        int not null,  -- pozitif: yükleme, negatif: harcama
  kind          text not null check (kind in ('purchase', 'demo', 'spend')),
  balance_after int not null,
  created_at    timestamptz not null default now()
);

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

alter table public.wallet_transactions enable row level security;

-- Kullanıcı yalnızca kendi hareketlerini görür; yazma yok (RPC/service-role)
drop policy if exists "wallet_transactions_own_read" on public.wallet_transactions;
create policy "wallet_transactions_own_read" on public.wallet_transactions
  for select to authenticated using (auth.uid() = user_id);

-- 2) add_tokens: mekan + tür bağlamı alır, ledger'a yazar.
--    Parametre eklendiği için drop+create; p_venue_id/p_kind default'lu olduğundan
--    eski deploy'un 2-parametreli çağrısı kesintisiz çalışır.
drop function if exists public.add_tokens(uuid, int);

create function public.add_tokens(
  p_user_id uuid,
  p_amount int,
  p_venue_id uuid default null,
  p_kind text default 'purchase'
)
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

  insert into public.user_wallets (user_id, balance)
       values (p_user_id, p_amount)
  on conflict (user_id)
       do update set balance = public.user_wallets.balance + excluded.balance,
                     updated_at = now()
  returning balance into v_balance;

  insert into public.wallet_transactions (user_id, venue_id, amount, kind, balance_after)
  values (p_user_id, p_venue_id, p_amount, p_kind, v_balance);

  return v_balance;
end
$$;

revoke execute on function public.add_tokens(uuid, int, uuid, text) from public, anon, authenticated;

-- 3) request_song: başarılı jeton düşümünü ledger'a yazar (aynı transaction —
--    kuyruk insert'i başarısız olursa ledger kaydı da geri alınır).
--    Gövde 0010 kopyası + ledger insert'i.
create or replace function public.request_song(
  p_user_id uuid,
  p_venue_id uuid,
  p_song_id uuid,
  p_priority boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost int := case when p_priority then 2 else 1 end;
  v_position int;
  v_username text;
  v_balance int;
begin
  -- Son 30 dk içinde çalındıysa reddet
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id
       and status = 'played' and user_id is not null
       and played_at >= now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', false, 'error', 'cooldown');
  end if;

  -- Şu an çalıyorsa reddet
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id and status = 'playing'
  ) then
    return jsonb_build_object('ok', false, 'error', 'playing');
  end if;

  -- Atomik jeton düşümü: global cüzdandan
  if not public.spend_tokens(p_user_id, v_cost) then
    return jsonb_build_object('ok', false, 'error', 'insufficient_tokens');
  end if;

  select balance into v_balance from public.user_wallets where user_id = p_user_id;
  insert into public.wallet_transactions (user_id, venue_id, song_id, amount, kind, balance_after)
  values (p_user_id, p_venue_id, p_song_id, -v_cost, 'spend', coalesce(v_balance, 0));

  -- Müşteri şarkıları arasında en son pozisyon — auto-fill aralığı (>=9000) hariç
  select coalesce(max(q.position), 0) + 1 into v_position
    from public.queue q
   where q.venue_id = p_venue_id and q.status = 'queued'
     and q.user_id is not null and q.position < 9000;

  select username into v_username from public.profiles where id = p_user_id;

  insert into public.queue (venue_id, song_id, user_id, added_by, tokens_spent, priority, position, status)
  values (
    p_venue_id, p_song_id, p_user_id,
    coalesce(v_username, 'Misafir'),
    v_cost, p_priority,
    case when p_priority then 0 else v_position end,
    'queued'
  );

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.request_song(uuid, uuid, uuid, boolean) from public, anon, authenticated;

-- 4) Müşterinin jeton hareketleri: mekan adı + şarkı bilgisiyle son 50 kayıt.
--    security invoker yeterli — wallet_transactions kendi-satır RLS'li,
--    venues.name kolon grant'lı, songs herkese-SELECT.
create or replace function public.get_wallet_history()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'amount', t.amount,
    'kind', t.kind,
    'balance_after', t.balance_after,
    'venue_name', v.name,
    'song_title', s.title,
    'song_artist', s.artist,
    'created_at', (extract(epoch from t.created_at) * 1000)::bigint
  ) order by t.created_at desc), '[]'::jsonb)
  from (
    select id, venue_id, song_id, amount, kind, balance_after, created_at
      from public.wallet_transactions
     where user_id = auth.uid()
     order by created_at desc
     limit 50
  ) t
  left join public.venues v on v.id = t.venue_id
  left join public.songs  s on s.id = t.song_id;
$$;

revoke execute on function public.get_wallet_history() from public, anon;
grant execute on function public.get_wallet_history() to authenticated;

commit;
