-- Yeni kullanıcı kaydında profiles satırı oluşturan trigger.
-- Bu trigger üretimde dashboard'dan elle tanımlanmıştı ve migration'larda yoktu;
-- sıfırdan kurulan bir ortamda kullanıcı adları hiç kaydedilmezdi. Buraya alındı.
--
-- ÖNEMLİ: üretimde çalışan trigger'a dokunulmaz. İki trigger aynı satırı eklemeye
-- çalışıp kayıt akışını kırmasın diye, farklı adlı bir profiles trigger'ı varsa
-- yenisi oluşturulmaz.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and t.tgname <> 'on_auth_user_created'
      and pg_get_functiondef(p.oid) ilike '%public.profiles%'
  ) then
    raise notice 'auth.users üzerinde profiles yazan başka bir trigger var; yenisi oluşturulmadı.';
  else
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

-- Trigger'dan önce oluşmuş ya da herhangi bir nedenle eksik kalmış profiller
insert into public.profiles (id, username)
select u.id, nullif(split_part(coalesce(u.email, ''), '@', 1), '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
