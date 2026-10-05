-- Misafir hesabını mevcut hesaba birleştirme.
--
-- Misafir (anonim) oturumdaki müşteri "Google ile devam et"e basınca Google
-- kimliği misafire bağlanır (linkIdentity). Seçtiği Google hesabıyla daha önce
-- açılmış bir PlayMyJam hesabı varsa Supabase bağlamayı reddeder
-- (identity_already_exists). O durumda müşteri mevcut hesabıyla giriş yapar ve
-- misafirde biriken her şey (cüzdan, jeton geçmişi, siparişler, sıra kayıtları,
-- talepler, favoriler, bildirim abonelikleri) o hesaba taşınır.
--
-- Kanıt "bilet"le taşınır: bilet misafir oturumu HÂLÂ açıkken kesilir
-- (create_guest_merge_ticket, auth.uid() = misafir), kimliği httpOnly çerezde
-- durur; Google girişinden sonra yeni oturum tüketir (merge_guest_account).
-- Bilet kimliği tahmin edilemez (gen_random_uuid) ve 15 dk geçerli; bileti
-- olmayan kimse başkasının misafir hesabını kendine çekemez.
--
-- Satırlar KOPYALANMAZ, user_id'leri değiştirilir: ledger'ın paid_amount'ı
-- (0057, hakediş) ve sipariş-ledger eşleşmesi aynen korunur. BEFORE INSERT
-- tetikleyicisi (wallet_tx_track_paid) UPDATE'te çalışmaz; paid_balance elle
-- toplanır.
--
-- Misafirin auth.users satırı silinmez (boş kalır); profili de olduğu gibi
-- durur — yalnızca kayıtlı kart anahtarı, hedefte yoksa taşınır.

create table if not exists public.guest_merge_tickets (
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

-- Yalnızca RPC'ler (security definer) erişir
alter table public.guest_merge_tickets enable row level security;
revoke all on public.guest_merge_tickets from anon, authenticated;

-- 1) Bilet: çağıran misafir olmalı
create or replace function public.create_guest_merge_ticket()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from auth.users where id = v_uid and is_anonymous) then
    raise exception 'not_guest';
  end if;

  -- Süresi geçmiş biletler birikmesin
  delete from public.guest_merge_tickets where expires_at < now();

  insert into public.guest_merge_tickets (guest_id) values (v_uid)
  returning id into v_id;
  return v_id;
end
$$;

-- 2) Birleştirme: çağıran kalıcı (anonim olmayan) hesap, bilet geçerli
create or replace function public.merge_guest_account(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := auth.uid();
  v_guest uuid;
  v_balance int;
  v_paid int;
  v_moved_tx int;
begin
  if v_target is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from auth.users where id = v_target and is_anonymous) then
    raise exception 'target_is_guest';
  end if;

  -- Bilet tek kullanımlık: silerek okunur
  delete from public.guest_merge_tickets
   where id = p_ticket and expires_at >= now()
  returning guest_id into v_guest;

  if v_guest is null then
    return jsonb_build_object('merged', false, 'reason', 'ticket_invalid');
  end if;
  if v_guest = v_target then
    return jsonb_build_object('merged', false, 'reason', 'same_user');
  end if;
  -- Bilet kesildikten sonra misafir e-posta ile kalıcı hesaba dönüştüyse
  -- o hesap kendi başına yaşar; içini boşaltmayız
  if not exists (select 1 from auth.users where id = v_guest and is_anonymous) then
    return jsonb_build_object('merged', false, 'reason', 'guest_not_anonymous');
  end if;

  -- Cüzdan: iki satırı da kilitle (harcama/yükleme araya girmesin)
  perform 1 from public.user_wallets
   where user_id in (v_guest, v_target)
   order by user_id
     for update;

  select balance, paid_balance into v_balance, v_paid
    from public.user_wallets where user_id = v_guest;

  if coalesce(v_balance, 0) > 0 or coalesce(v_paid, 0) > 0 then
    insert into public.user_wallets (user_id, balance, paid_balance)
    values (v_target, v_balance, v_paid)
    on conflict (user_id) do update
      set balance      = public.user_wallets.balance + excluded.balance,
          paid_balance = public.user_wallets.paid_balance + excluded.paid_balance;
  end if;
  delete from public.user_wallets where user_id = v_guest;

  update public.wallet_transactions set user_id = v_target where user_id = v_guest;
  get diagnostics v_moved_tx = row_count;

  update public.payment_orders set user_id = v_target where user_id = v_guest;
  update public.queue          set user_id = v_target where user_id = v_guest;
  update public.song_requests  set user_id = v_target where user_id = v_guest;
  update public.one_time_songs set consumed_by = v_target where consumed_by = v_guest;

  -- Favoriler (user_id, song_id) tekil: hedefte zaten olan atlanır
  update public.user_favorites f set user_id = v_target
   where f.user_id = v_guest
     and not exists (
       select 1 from public.user_favorites t
        where t.user_id = v_target and t.song_id = f.song_id);
  delete from public.user_favorites where user_id = v_guest;

  -- Aynı cihazın bildirim aboneliği artık kalıcı hesaba gitsin
  update public.push_subscriptions set user_id = v_target where user_id = v_guest;

  -- Kayıtlı kart (0048): hedefte yoksa misafirinki geçer
  update public.profiles p
     set iyzico_card_user_key = g.iyzico_card_user_key
    from public.profiles g
   where p.id = v_target and g.id = v_guest
     and p.iyzico_card_user_key is null
     and g.iyzico_card_user_key is not null;

  return jsonb_build_object(
    'merged', true,
    'guest_id', v_guest,
    'tokens', coalesce(v_balance, 0),
    'transactions', v_moved_tx
  );
end
$$;

revoke all on function public.create_guest_merge_ticket() from public, anon;
revoke all on function public.merge_guest_account(uuid) from public, anon;
grant execute on function public.create_guest_merge_ticket() to authenticated;
grant execute on function public.merge_guest_account(uuid) to authenticated;
