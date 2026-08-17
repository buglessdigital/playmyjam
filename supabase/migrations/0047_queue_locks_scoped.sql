-- 0046'daki kilidi KAPSAMLI hale getirir ve kuyruğu ilerleten yola da açar.
--
-- 0046 mekan başına tek kilit veriyordu ve yalnızca dolum (fillQueue) onu
-- kullanıyordu. İki eksik kaldı:
--
--   1) Kuyruğu ilerleten yol (playNextFromQueue) korumasızdı. Müşteri şarkı
--      ekleyince /api/queue `after()` içinde "boştaysa başlat" diyor; bu yol
--      player claim'ini de istemcideki advance kilidini de atlıyor. İki müşteri
--      aynı anda istek atınca ikinci çağrı, ilkinin sahneye yeni koyduğu satırı
--      "playing → played" yaparak HİÇ ÇALMADAN yakıyordu — jetonla alınmış
--      şarkı dahil.
--   2) Kilit tek olduğu için ilerletme ile dolum aynı kilidi paylaşamaz: uzun
--      süren bir dolum, biten şarkının yerine yenisini koymayı bloklar ve müzik
--      susardı.
--
-- Çözüm: kilit satırı artık (venue_id, scope) — 'fill' ve 'advance' birbirini
-- beklemez. İki kapsamın davranışı da farklı:
--   fill    → dirty bayrağı kalkar, kilidi tutan iş bitince bir tur daha atar
--             (dolum tekrarlanabilir bir iştir, en son istek karşılıksız kalmamalı)
--   advance → dirty YOK. İlerletme tekrarlanabilir bir iş DEĞİLDİR; ikinci çağrı
--             zaten gereksizdir ve tekrarlanırsa şarkı atlar. Kilidi alamayan
--             çağrı hiçbir şey yapmadan çekilir.

alter table public.queue_fill_locks
  add column if not exists scope text not null default 'fill';

alter table public.queue_fill_locks
  drop constraint if exists queue_fill_locks_pkey;

alter table public.queue_fill_locks
  add primary key (venue_id, scope);

-- Eski imzalar düşürülüp yenileri kuruluyor. p_scope ve p_mark_dirty
-- varsayılanlı olduğu için 0046 çağrı biçimi ('fill', dirty açık) aynen çalışır
-- — kod deploy edilmeden önce migration uygulanırsa arada kopukluk olmaz.
drop function if exists public.try_acquire_queue_fill_lock(uuid, text, int);
drop function if exists public.finish_queue_fill(uuid, text, int);
drop function if exists public.release_queue_fill_lock(uuid, text);

create function public.try_acquire_queue_fill_lock(
  p_venue_id uuid,
  p_holder text,
  p_ttl_seconds int default 60,
  p_scope text default 'fill',
  -- false: kilit doluyken gelen istek iz bırakmaz (advance kapsamı)
  p_mark_dirty boolean default true
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into public.queue_fill_locks as l (venue_id, scope, holder, locked_until, dirty)
  values (p_venue_id, p_scope, p_holder, now() + make_interval(secs => p_ttl_seconds), false)
  on conflict (venue_id, scope) do update
     set holder = excluded.holder,
         locked_until = excluded.locked_until,
         dirty = false
   -- Yalnızca kira dolmuşsa devralınır; dolmamışsa satır güncellenmez ve
   -- RETURNING boş döner (v_ok null kalır).
   where l.locked_until < now()
  returning true into v_ok;

  if coalesce(v_ok, false) then
    return true;
  end if;

  if p_mark_dirty then
    update public.queue_fill_locks
       set dirty = true
     where venue_id = p_venue_id and scope = p_scope;
  end if;

  return false;
end;
$$;

create function public.finish_queue_fill(
  p_venue_id uuid,
  p_holder text,
  p_ttl_seconds int default 60,
  p_scope text default 'fill'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dirty boolean;
begin
  select dirty into v_dirty
    from public.queue_fill_locks
   where venue_id = p_venue_id and scope = p_scope and holder = p_holder
   for update;

  -- Kira dolmuş ve kilidi başkası devralmış: bu iş artık koşucu değil, çekilir.
  if v_dirty is null then
    return false;
  end if;

  if v_dirty then
    update public.queue_fill_locks
       set dirty = false,
           locked_until = now() + make_interval(secs => p_ttl_seconds)
     where venue_id = p_venue_id and scope = p_scope and holder = p_holder;
    return true;
  end if;

  update public.queue_fill_locks
     set locked_until = now() - interval '1 second'
   where venue_id = p_venue_id and scope = p_scope and holder = p_holder;
  return false;
end;
$$;

-- Koşulsuz bırakma: hata / tur sınırı hallerinde çağrılır. dirty bayrağına
-- DOKUNMAZ — o bayrak bekleyen bir isteğin karşılığıdır, kilidi devralan sonraki
-- çağrı zaten sıfırdan iş yapacağı için bayrağı kendisi sıfırlar.
create function public.release_queue_fill_lock(
  p_venue_id uuid,
  p_holder text,
  p_scope text default 'fill'
) returns void
language sql
security definer
set search_path = public
as $$
  update public.queue_fill_locks
     set locked_until = now() - interval '1 second'
   where venue_id = p_venue_id and scope = p_scope and holder = p_holder;
$$;

revoke execute on function public.try_acquire_queue_fill_lock(uuid, text, int, text, boolean) from public, anon, authenticated;
revoke execute on function public.finish_queue_fill(uuid, text, int, text) from public, anon, authenticated;
revoke execute on function public.release_queue_fill_lock(uuid, text, text) from public, anon, authenticated;
grant execute on function public.try_acquire_queue_fill_lock(uuid, text, int, text, boolean) to service_role;
grant execute on function public.finish_queue_fill(uuid, text, int, text) to service_role;
grant execute on function public.release_queue_fill_lock(uuid, text, text) to service_role;
