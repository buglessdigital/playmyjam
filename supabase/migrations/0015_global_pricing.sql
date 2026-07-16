-- 0015: Küresel fiyatlandırma — sabit birim fiyat (app_settings), global jeton
-- paketleri, mekan bazlı istek ücretleri ve tek seferlik 1M jeton grant'i.
-- SIRALAMA: ÖNCE bu SQL çalıştırılır, SONRA kod deploy edilir, EN SON 0016.
-- Bu dosya tamamen additive'dir; eski kod bu SQL uygulandıktan sonra da çalışır.

begin;

-- 1) Global ayarlar (yalnızca service-role okur/yazar; policy bilerek yok)
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values ('token_unit_price', to_jsonb(30))
on conflict (key) do nothing;

-- 2) Global jeton paketleri (en fazla 4 kuralı uygulama katmanında;
--    "en fazla bir popüler paket" kuralı partial unique index ile DB'de)
create table if not exists public.global_token_packages (
  id            uuid primary key default gen_random_uuid(),
  label         text not null check (char_length(label) between 1 and 40),
  tokens        int not null check (tokens > 0),
  price         numeric(10,2) not null check (price > 0),
  popular       boolean not null default false,
  display_order int not null default 1,
  created_at    timestamptz not null default now()
);
alter table public.global_token_packages enable row level security;

create unique index if not exists global_token_packages_one_popular
  on public.global_token_packages (popular) where popular;

-- Seed: yalnızca tablo boşsa (fiyatlar panelden 30 TL bazına göre güncellenmeli)
insert into public.global_token_packages (label, tokens, price, popular, display_order)
select v.* from (values
  ('Başlangıç', 5,  50::numeric(10,2),  false, 1),
  ('Popüler',   12, 100::numeric(10,2), true,  2),
  ('Süper',     25, 180::numeric(10,2), false, 3),
  ('Mega',      50, 300::numeric(10,2), false, 4)
) as v(label, tokens, price, popular, display_order)
where not exists (select 1 from public.global_token_packages);

-- 3) Mekan bazlı istek ücretleri (mevcut mekanlar default ile 1/2 kalır)
alter table public.venues
  add column if not exists request_cost  int not null default 1,
  add column if not exists priority_cost int not null default 2;

do $$ begin
  alter table public.venues add constraint venues_request_cost_positive  check (request_cost  > 0);
  alter table public.venues add constraint venues_priority_cost_positive check (priority_cost > 0);
exception when duplicate_object then null; end $$;

-- 4) Ledger kind: 'grant' eklenir; 'demo' geçmiş kayıtların geçerliliği için kalır
alter table public.wallet_transactions drop constraint if exists wallet_transactions_kind_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check
  check (kind in ('purchase', 'demo', 'spend', 'grant'));

-- 5) request_song: istek ücretleri artık venues.request_cost / priority_cost'tan
--    (0012 gövdesiyle aynı; yalnızca v_cost hesabı değişti)
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
  v_request_cost int;
  v_priority_cost int;
  v_cost int;
  v_position int;
  v_username text;
  v_balance int;
begin
  select request_cost, priority_cost into v_request_cost, v_priority_cost
    from public.venues where id = p_venue_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;
  v_cost := case when p_priority then coalesce(v_priority_cost, 2)
                 else coalesce(v_request_cost, 1) end;

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

-- 6) TEK SEFERLİK: taneryldrm111@gmail.com hesabına 1.000.000 jeton (idempotent —
--    hesapta daha önce 'grant' kaydı varsa veya hesap yoksa hiçbir şey yapmaz)
do $$
declare v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = 'taneryldrm111@gmail.com' limit 1;
  if v_user is null then
    raise notice 'grant atlandı: taneryldrm111@gmail.com hesabı bulunamadı';
  elsif exists (select 1 from public.wallet_transactions where user_id = v_user and kind = 'grant') then
    raise notice 'grant atlandı: bu hesaba daha önce grant verilmiş';
  else
    perform public.add_tokens(v_user, 1000000, null, 'grant');
  end if;
end $$;

commit;
