-- Mekan sağlık kaydı: "müzik beklenmedik şekilde durdu mu, sıra karıştı mı?"
-- sorularını super admin'in görebilmesi için.
--
-- category 'player': player'ın kendi bildirdiği olaylar (takılma, kurtarma,
--   YouTube hatası, sekme kısılması, ağ kopması...) ve sunucunun heartbeat'ten
--   çıkardıkları (uzun sinyal kesintisi, ilerlemeyen şarkı). Uygulama yazar.
-- category 'queue': kuyruk tetikleyicisi (aşağıda) yazar — uygulamadaki ~20
--   yazma yolunun hiçbiri atlanamasın diye kayıt veritabanında tutuluyor.
--
-- actor: değişikliği kimin yaptığı. Uygulama her isteğe `x-pmj-actor` başlığı
-- ekler (lib/actor.ts); PostgREST bunu request.headers ayarına koyar.
-- "admin-" önekliler mekanın bilerek yaptığı işlerdir, uyarı sayılmaz.

create table if not exists public.venue_events (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues(id) on delete cascade,
  at timestamptz not null default now(),
  category text not null check (category in ('player', 'queue')),
  kind text not null,
  severity text not null check (severity in ('info', 'warn', 'error')),
  actor text,
  message text not null,
  detail jsonb
);

create index if not exists venue_events_venue_at_idx on public.venue_events (venue_id, at desc);
create index if not exists venue_events_problems_idx on public.venue_events (at desc)
  where severity <> 'info';

alter table public.venue_events enable row level security;
revoke all on public.venue_events from anon, authenticated;
grant select, insert, delete on public.venue_events to service_role;

-- Kuyrukta a satırı b'den ÖNCE mi çalar? lib/queue.ts advanceToNext'in seçim
-- sırasıyla birebir: öncelikli önce, sonra position, added_at, id.
create or replace function public.queue_row_before(
  a_priority boolean, a_position integer, a_added_at timestamptz, a_id uuid,
  b_priority boolean, b_position integer, b_added_at timestamptz, b_id uuid
) returns boolean
language sql
immutable
as $$
  select case
    when a_priority is distinct from b_priority then coalesce(a_priority, false)
    else (coalesce(a_position, 2147483647), a_added_at, a_id)
       < (coalesce(b_position, 2147483647), b_added_at, b_id)
  end
$$;

create or replace function public.log_queue_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_admin boolean;
  v_customer boolean := new.user_id is not null;
  v_title text;
  v_other record;
  v_seconds integer;
  v_sev text;
begin
  begin
    v_actor := nullif(current_setting('request.headers', true), '')::json->>'x-pmj-actor';
  exception when others then
    v_actor := null;
  end;
  v_admin := coalesce(v_actor like 'admin-%', false);

  select coalesce(s.title, '?') || ' — ' || coalesce(s.artist, '?') into v_title
  from songs s where s.id = new.song_id;
  v_title := coalesce(v_title, 'bilinmeyen şarkı');

  if tg_op = 'INSERT' then
    if v_customer then
      insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
      values (new.venue_id, 'queue', 'customer_added', 'info', v_actor,
        format('Müşteri isteği sıraya girdi: %s (%s%s)', v_title, coalesce(new.added_by, '?'),
          case when new.priority then ', öncelikli' else '' end),
        jsonb_build_object('queue_id', new.id, 'song_id', new.song_id, 'tokens', new.tokens_spent));
    elsif new.status = 'queued' and not v_admin then
      select q.id, coalesce(s.title, '?') as title into v_other
      from queue q left join songs s on s.id = q.song_id
      where q.venue_id = new.venue_id and q.status = 'queued' and q.user_id is not null
        and q.id <> new.id
        and queue_row_before(new.priority, new.position, new.added_at, new.id,
                             q.priority, q.position, q.added_at, q.id)
      limit 1;
      if found then
        insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
        values (new.venue_id, 'queue', 'auto_ahead', 'warn', v_actor,
          format('Müşteri isteğinin (%s) önüne otomatik şarkı girdi: %s', v_other.title, v_title),
          jsonb_build_object('queue_id', new.id, 'customer_queue_id', v_other.id));
      end if;
    end if;
    return null;
  end if;

  -- UPDATE: durum değişimi
  if new.status is distinct from old.status then
    if new.status = 'playing' then
      if not v_admin then
        select q.id, coalesce(s.title, '?') as title into v_other
        from queue q left join songs s on s.id = q.song_id
        where q.venue_id = new.venue_id and q.status = 'queued' and q.user_id is not null
          and q.id <> new.id
          and queue_row_before(q.priority, q.position, q.added_at, q.id,
                               new.priority, new.position, new.added_at, new.id)
        order by q.priority desc, q.position, q.added_at, q.id
        limit 1;
        if found then
          -- Bağlantı kesintisinde player kendi tamponundan çalmış olabilir (sync):
          -- sıra yine bozulmuştur ama sebebi bellidir
          insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
          values (new.venue_id, 'queue', 'out_of_order',
            case when v_actor = 'player-sync' then 'warn' else 'error' end, v_actor,
            format('Sıra atlandı: "%s" çaldı ama önünde bekleyen müşteri isteği vardı ("%s")',
              v_title, v_other.title),
            jsonb_build_object('queue_id', new.id, 'skipped_queue_id', v_other.id));
        end if;
      end if;

      -- 30 dk kuralı yalnızca müşteri isteklerinde geçerli (request_song reddeder);
      -- otomatik dolum aynı şarkıyı bilerek tekrar seçebilir, o uyarı sayılmaz
      if v_customer and not v_admin and exists (
        select 1 from queue q
        where q.venue_id = new.venue_id and q.song_id = new.song_id and q.id <> new.id
          and q.started_at > now() - interval '30 minutes'
      ) then
        insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
        values (new.venue_id, 'queue', 'repeat_play', 'warn', v_actor,
          format('Müşteri isteği, 30 dk içinde zaten çalmış bir şarkıyı yeniden çaldırdı: %s', v_title),
          jsonb_build_object('queue_id', new.id, 'song_id', new.song_id));
      end if;

      if v_customer then
        insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
        values (new.venue_id, 'queue', 'customer_playing', 'info', v_actor,
          format('Müşteri isteği çalmaya başladı: %s', v_title),
          jsonb_build_object('queue_id', new.id,
            'waited_seconds', extract(epoch from now() - new.added_at)::integer));
      end if;

    elsif new.status = 'played' and v_customer then
      if old.status = 'queued' then
        insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
        values (new.venue_id, 'queue', 'never_played', case when v_admin then 'info' else 'error' end,
          v_actor, format('Müşteri isteği hiç çalmadan "çalındı" sayıldı: %s', v_title),
          jsonb_build_object('queue_id', new.id));
      elsif old.status = 'playing' and old.started_at is not null then
        v_seconds := extract(epoch from now() - old.started_at)::integer;
        if v_seconds < 30 then
          v_sev := case when v_admin then 'info'
                        when v_actor like 'player-next-%' then 'warn'  -- takılma/hata kurtarması
                        else 'error' end;
          insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
          values (new.venue_id, 'queue', 'cut_short', v_sev, v_actor,
            format('Müşteri şarkısı %s sn sonra kesildi: %s', v_seconds, v_title),
            jsonb_build_object('queue_id', new.id, 'seconds', v_seconds));
        end if;
      end if;

    elsif new.status = 'removed' and v_customer and old.status in ('queued', 'playing') then
      insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
      values (new.venue_id, 'queue',
        case when v_admin then 'customer_removed' else 'customer_lost' end,
        case when v_admin then 'info' else 'error' end, v_actor,
        case when v_admin then format('Mekan müşteri isteğini sıradan çıkardı: %s', v_title)
             else format('Müşteri isteği çalınmadan sıradan düştü: %s', v_title) end,
        jsonb_build_object('queue_id', new.id, 'tokens', new.tokens_spent));
    end if;

  -- UPDATE: sıra numarası değişimi (otomatik dolum yeniden numaralıyor)
  elsif new.position is distinct from old.position and new.status = 'queued'
        and not v_customer and not v_admin then
    select q.id, coalesce(s.title, '?') as title into v_other
    from queue q left join songs s on s.id = q.song_id
    where q.venue_id = new.venue_id and q.status = 'queued' and q.user_id is not null
      and q.id <> new.id
      and queue_row_before(new.priority, new.position, new.added_at, new.id,
                           q.priority, q.position, q.added_at, q.id)
    limit 1;
    if found and not exists (
      select 1 from venue_events e
      where e.venue_id = new.venue_id and e.kind = 'auto_ahead'
        and e.detail->>'queue_id' = new.id::text and e.at > now() - interval '1 hour'
    ) then
      insert into venue_events (venue_id, category, kind, severity, actor, message, detail)
      values (new.venue_id, 'queue', 'auto_ahead', 'warn', v_actor,
        format('Müşteri isteğinin (%s) önüne otomatik şarkı geçti: %s', v_other.title, v_title),
        jsonb_build_object('queue_id', new.id, 'customer_queue_id', v_other.id));
    end if;
  end if;

  return null;
exception when others then
  -- Kayıt ASLA kuyruk yazmasını düşürmemeli
  return null;
end;
$$;

drop trigger if exists queue_log_event on public.queue;
create trigger queue_log_event
  after insert or update of status, position on public.queue
  for each row execute function public.log_queue_event();
