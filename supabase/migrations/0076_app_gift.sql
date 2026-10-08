-- 0076: Mobil uygulamaya geçene hediye jeton.
--
-- Web'den iOS/Android uygulamasına geçen müşteriye 1 jeton. Kurallar:
--   * yalnızca kayıtlı hesap (misafir/anonim hesap ALAMAZ — yoksa her yeni
--     misafir oturumu bir jeton daha demek olurdu),
--   * hesap başına bir kez,
--   * cihaz başına bir kez (aynı telefonda yeni hesap açarak tekrar alınamaz).
--
-- Cihaz kimliğini SUNUCU üretir: /api/app/gift, App Attest/DeviceCheck veya
-- Play Integrity kanıtını doğrulayıp kalıcı cihaz anahtarının SHA-256'sını
-- buraya geçirir (bkz. lib/app-gift.ts). Ham kimlik saklanmaz.
--
-- Hesap silinirse satır KALIR, user_id boşa düşer: cihaz özeti hediyenin aynı
-- telefona ikinci kez verilmesini engellemeye devam eder (suistimal önleme,
-- KVKK md. 5/2-f meşru menfaat; özet kişiyi tek başına tanımlamaz).
--
-- Jeton 'grant' türüyle yazılır: 0057'deki tetikleyici onu ücretsiz sayar,
-- mekan hakedişine girmez. Cüzdan geçmişinde "Hediye jeton" görünür.
--
-- Uygulama: ÖNCE bu SQL, SONRA kod. Fonksiyon yalnızca service_role'e açık;
-- eski kod onu hiç çağırmadığı için SQL tek başına hiçbir şeyi değiştirmez.

begin;

create table if not exists public.app_gift_claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,
  device_hash text not null unique check (length(device_hash) = 64),
  platform    text not null check (platform in ('ios', 'android')),
  tokens      int  not null check (tokens > 0),
  claimed_at  timestamptz not null default now()
);

alter table public.app_gift_claims enable row level security;

-- Müşteri yalnızca kendi kaydını görebilir (arayüz "hediyeni aldın" diyebilsin);
-- yazma yalnızca aşağıdaki fonksiyondan.
drop policy if exists app_gift_claims_select_own on public.app_gift_claims;
create policy app_gift_claims_select_own on public.app_gift_claims
  for select to authenticated using (user_id = auth.uid());

revoke all on public.app_gift_claims from anon;
revoke insert, update, delete on public.app_gift_claims from authenticated;

create or replace function public.claim_app_gift(
  p_user_id     uuid,
  p_device_hash text,
  p_platform    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tokens constant int := 1;
  v_anonymous boolean;
  v_balance int;
begin
  select is_anonymous into v_anonymous from auth.users where id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'no_user');
  end if;
  if v_anonymous then
    return jsonb_build_object('status', 'guest');
  end if;

  -- Aynı kullanıcı/cihazdan eşzamanlı iki isteği sıraya sok: unique ihlali
  -- yerine anlamlı durum dönsün
  perform pg_advisory_xact_lock(hashtext('app_gift:' || p_device_hash));
  perform pg_advisory_xact_lock(hashtext('app_gift:' || p_user_id::text));

  if exists (select 1 from public.app_gift_claims where user_id = p_user_id) then
    return jsonb_build_object('status', 'already_claimed');
  end if;
  if exists (select 1 from public.app_gift_claims where device_hash = p_device_hash) then
    return jsonb_build_object('status', 'device_used');
  end if;

  insert into public.app_gift_claims (user_id, device_hash, platform, tokens)
  values (p_user_id, p_device_hash, p_platform, c_tokens);

  v_balance := public.add_tokens(p_user_id, c_tokens, null, 'grant');

  return jsonb_build_object('status', 'granted', 'tokens', c_tokens, 'balance', v_balance);
end
$$;

revoke execute on function public.claim_app_gift(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_app_gift(uuid, text, text) to service_role;

commit;
