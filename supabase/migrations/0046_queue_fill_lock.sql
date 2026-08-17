-- Kuyruk dolumunu mekan başına TEKE indiren kilit.
--
-- Neden: fillQueue çok adımlı bir JS fonksiyonu (kuyruğu oku → rotasyonu hesapla
-- → tüketim defterini yaz → satırları ekle) ve sekiz ayrı yerden, üçü
-- fire-and-forget olmak üzere çağrılıyor. İki çağrı çakışınca ikincisi kuyruğu
-- BOŞ, tüketim defterini ise birincinin yazdığı haliyle DOLU okuyabiliyor:
-- listeden alacak şarkı bulamıyor, QUEUE_FLOOR yedeğine düşüyor ve çalan
-- listeyle ilgisi olmayan 10 rastgele katalog şarkısını kuyruğa yazıyor.
-- (16 Ağu 2026 22:47:51, The Mezzanine Bar: "mezzanine 2024 summer" çalarken
-- kuyruğa Boogie Wonderland ve 9 şarkı daha girdi.)
--
-- Postgres advisory lock işe yaramaz: dolum onlarca HTTP turu sürüyor,
-- pg_advisory_xact_lock ise PostgREST'in tek RPC transaction'ıyla birlikte
-- bitiyor. Bu yüzden kiralık (lease) satır kilidi kullanılıyor.
--
-- Kilidi alamayan çağrı BEKLEMEZ, "dirty" bayrağını kaldırıp döner; kilidi
-- tutan iş bitiminde bayrağı görüp bir tur daha atar. Böylece hem tek koşucu
-- garantisi olur hem de en son isteğin ardından mutlaka bir dolum yapılır —
-- "araya temizleme girdi, dolum atlandı, müzik sustu" hali oluşmaz.

create table if not exists public.queue_fill_locks (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  holder text,
  -- Kira bitişi: tutan iş çökerse/timeout olursa kilit kendiliğinden serbest kalır
  locked_until timestamptz not null default now(),
  -- Kilit doluyken gelen istek: tutan iş bitince bir tur daha atsın
  dirty boolean not null default false
);

alter table public.queue_fill_locks enable row level security;
-- Politika YOK: tabloya yalnızca service_role (RLS'i atlar) erişir.

-- Kilidi almayı dener. Alamazsa dirty=true yazıp false döner.
create or replace function public.try_acquire_queue_fill_lock(
  p_venue_id uuid,
  p_holder text,
  p_ttl_seconds int default 60
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into public.queue_fill_locks as l (venue_id, holder, locked_until, dirty)
  values (p_venue_id, p_holder, now() + make_interval(secs => p_ttl_seconds), false)
  on conflict (venue_id) do update
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

  update public.queue_fill_locks
     set dirty = true
   where venue_id = p_venue_id;

  return false;
end;
$$;

-- Dolum bitti. dirty ise kilit BIRAKILMAZ, kira uzatılır ve true döner:
-- çağıran bir tur daha atar. Değilse kilit serbest bırakılır, false döner.
create or replace function public.finish_queue_fill(
  p_venue_id uuid,
  p_holder text,
  p_ttl_seconds int default 60
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
   where venue_id = p_venue_id and holder = p_holder
   for update;

  -- Kira dolmuş ve kilidi başkası devralmış: bu iş artık koşucu değil, çekilir.
  if v_dirty is null then
    return false;
  end if;

  if v_dirty then
    update public.queue_fill_locks
       set dirty = false,
           locked_until = now() + make_interval(secs => p_ttl_seconds)
     where venue_id = p_venue_id and holder = p_holder;
    return true;
  end if;

  update public.queue_fill_locks
     set locked_until = now() - interval '1 second'
   where venue_id = p_venue_id and holder = p_holder;
  return false;
end;
$$;

-- Koşulsuz bırakma: hata / tur sınırı hallerinde çağrılır. dirty bayrağına
-- DOKUNMAZ — o bayrak bekleyen bir isteğin karşılığıdır, kilidi devralan sonraki
-- çağrı zaten sıfırdan dolum yapacağı için bayrağı kendisi sıfırlar.
create or replace function public.release_queue_fill_lock(
  p_venue_id uuid,
  p_holder text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.queue_fill_locks
     set locked_until = now() - interval '1 second'
   where venue_id = p_venue_id and holder = p_holder;
$$;

revoke execute on function public.try_acquire_queue_fill_lock(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.finish_queue_fill(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.release_queue_fill_lock(uuid, text) from public, anon, authenticated;
grant execute on function public.try_acquire_queue_fill_lock(uuid, text, int) to service_role;
grant execute on function public.finish_queue_fill(uuid, text, int) to service_role;
grant execute on function public.release_queue_fill_lock(uuid, text) to service_role;
