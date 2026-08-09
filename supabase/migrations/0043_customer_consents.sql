-- 0043 — Müşteri kaydında alınan onayların kaydı.
--
-- Kayıt ekranında üç kutu var:
--   1) KVKK Aydınlatma Metni okundu (zorunlu)
--   2) Kullanım Şartları + Gizlilik Politikası kabul (zorunlu)
--   3) Ticari elektronik ileti izni (İSTEĞE BAĞLI — 6563 s. Kanun gereği
--      hizmetin şartı yapılamaz; kutu işaretsiz gelir)
--
-- Onaylar profil satırında damgalanır. İspat yükü bizde olduğu için "true/false"
-- değil zaman damgası tutulur; ticari ileti için hem güncel durum hem de son
-- değişiklik anı saklanır (İYS red kayıtları da tarihli olmalı).

alter table public.profiles
  add column if not exists kvkk_consent_at timestamptz,
  add column if not exists terms_consent_at timestamptz,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;

comment on column public.profiles.kvkk_consent_at is
  'Aydınlatma metninin okunduğunun beyan edildiği an. null = onay alınmamış (kayıt akışı tamamlanmamış).';
comment on column public.profiles.marketing_consent is
  'Ticari elektronik ileti izni. Kullanıcı ayarlardan her an geri alabilir.';

-- Bu migration'dan önce kayıt olmuş kullanıcılar geriye dönük onaylı sayılır:
-- onlara zorunlu kutular gösterilmedi, giriş yollarında yeniden sorulmasın.
-- Damga olarak hesabın açılış anı kullanılır (migration anı değil) — kayıt
-- tarihiyle tutarlı olsun.
update public.profiles p
set kvkk_consent_at = coalesce(p.kvkk_consent_at, u.created_at),
    terms_consent_at = coalesce(p.terms_consent_at, u.created_at)
from auth.users u
where u.id = p.id
  and (p.kvkk_consent_at is null or p.terms_consent_at is null);

-- Kayıt anındaki onaylar signUp metadata'sıyla gelir; profil satırını açan
-- trigger onları aynı anda damgalar. (0018 gövdesi; yalnızca onay alanları
-- eklendi. Üretimde farklı adlı bir trigger çalışıyorsa aşağıdaki RPC ağı
-- yakalar — bkz. claim_signup_consents.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_kvkk boolean := coalesce((v_meta ->> 'kvkk_consent')::boolean, false);
  v_terms boolean := coalesce((v_meta ->> 'terms_consent')::boolean, false);
  v_marketing boolean := coalesce((v_meta ->> 'marketing_consent')::boolean, false);
begin
  insert into public.profiles (
    id, username, kvkk_consent_at, terms_consent_at, marketing_consent, marketing_consent_at
  )
  values (
    new.id,
    coalesce(
      nullif(v_meta ->> 'username', ''),
      nullif(v_meta ->> 'full_name', ''),
      nullif(v_meta ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    case when v_kvkk then now() end,
    case when v_terms then now() end,
    v_marketing,
    case when v_kvkk then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Onayları JWT'deki kayıt metadata'sından profile taşır. Trigger'ın çalışmadığı
-- ya da profilin başka bir yoldan açıldığı durumlar için emniyet: her giriş
-- yolunda (mekan çerezi kurulurken, Google dönüşünde, e-posta onayında)
-- çağrılır ve "onay eksik mi" sorusunu yanıtlar.
create or replace function public.claim_signup_consents()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  v_missing boolean;
begin
  if auth.uid() is null then
    return true;
  end if;

  update public.profiles
  set kvkk_consent_at = coalesce(
        kvkk_consent_at,
        case when coalesce((v_meta ->> 'kvkk_consent')::boolean, false) then now() end
      ),
      terms_consent_at = coalesce(
        terms_consent_at,
        case when coalesce((v_meta ->> 'terms_consent')::boolean, false) then now() end
      ),
      marketing_consent = marketing_consent
        or coalesce((v_meta ->> 'marketing_consent')::boolean, false),
      marketing_consent_at = case
        when marketing_consent then marketing_consent_at
        when coalesce((v_meta ->> 'marketing_consent')::boolean, false) then now()
        else marketing_consent_at
      end
  where id = auth.uid();

  select (kvkk_consent_at is null or terms_consent_at is null)
  into v_missing
  from public.profiles
  where id = auth.uid();

  -- Profil satırı henüz yoksa onay da yok sayılır
  return coalesce(v_missing, true);
end;
$$;

-- Zorunlu onaylar ekrandan verildiğinde damgalanır; ticari ileti izni her
-- çağrıda güncel değere çekilir (ayarlardan geri alma da bu yolu kullanır).
create or replace function public.record_consents(p_marketing boolean)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set kvkk_consent_at = coalesce(kvkk_consent_at, now()),
      terms_consent_at = coalesce(terms_consent_at, now()),
      marketing_consent = coalesce(p_marketing, false),
      marketing_consent_at = case
        when coalesce(p_marketing, false) is distinct from marketing_consent then now()
        else marketing_consent_at
      end
  where id = auth.uid();
$$;

-- Ticari ileti tercihini tek başına günceller (ayarlar ekranı). Zorunlu
-- onaylara dokunmaz.
create or replace function public.set_marketing_consent(p_value boolean)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set marketing_consent = coalesce(p_value, false),
      marketing_consent_at = now()
  where id = auth.uid();
$$;

revoke execute on function public.claim_signup_consents() from public, anon;
revoke execute on function public.record_consents(boolean) from public, anon;
revoke execute on function public.set_marketing_consent(boolean) from public, anon;
grant execute on function public.claim_signup_consents() to authenticated;
grant execute on function public.record_consents(boolean) to authenticated;
grant execute on function public.set_marketing_consent(boolean) to authenticated;

-- profiles üzerinde kolon bazlı grant varsa yeni kolonlar dışarıda kalırdı
-- (0032/0033'teki venues tuzağının aynısı). RPC'ler security invoker olduğu
-- için kullanıcının kendi yetkisiyle yazıyorlar; grant açıkça veriliyor.
-- Tablo bazlı grant zaten varsa bu satırlar bir şeyi değiştirmez.
grant select (kvkk_consent_at, terms_consent_at, marketing_consent, marketing_consent_at)
  on public.profiles to authenticated;
grant update (kvkk_consent_at, terms_consent_at, marketing_consent, marketing_consent_at)
  on public.profiles to authenticated;
