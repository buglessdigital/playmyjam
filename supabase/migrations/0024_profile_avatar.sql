-- Müşteri profil avatarı.
--
-- Avatarlar görsel dosya değil, uygulamada tanımlı gradyan+SVG setidir
-- (lib/avatars.tsx). Burada yalnızca seçilen avatarın kısa kimliği tutulur.
--
-- Kısıt bilerek "izinli id listesi" değil, biçim kontrolü: yeni avatar eklemek
-- migration gerektirmesin. Bilinmeyen bir id yazılırsa arayüz sessizce baş
-- harfe düşer (lib/avatars.tsx: getAvatar).

alter table public.profiles
  add column if not exists avatar_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_id_format'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_id_format
      check (avatar_id is null or avatar_id ~ '^[a-z][a-z0-9_-]{0,31}$');
  end if;
end $$;

-- Profil sayfası özeti (0010 gövdesi; yalnızca avatar_id eklendi)
create or replace function public.get_profile_state(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'username', (select username from public.profiles where id = auth.uid()),
    'avatar_id', (select avatar_id from public.profiles where id = auth.uid()),
    'token_balance', coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0),
    'fav_count', (select count(*) from public.user_favorites where user_id = auth.uid()),
    'request_count', (select count(*) from public.queue where user_id = auth.uid())
  );
$$;

revoke execute on function public.get_profile_state(uuid) from public, anon;
grant execute on function public.get_profile_state(uuid) to authenticated;
