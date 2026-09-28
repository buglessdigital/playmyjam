-- Mekan canlı yayını: müşteri ekranlarının realtime yükünü mekandaki telefon
-- sayısından bağımsız hale getirir.
--
-- ESKİ YOL: müşteri ekranları queue / now_playing / venue_songs /
-- one_time_songs tablolarına postgres_changes ile abone olup HER satır
-- değişikliğinde veriyi yeniden çekiyordu. Player 5 sn'de bir now_playing'e
-- heartbeat yazdığı için mekandaki her telefon 5 sn'de bir ~3 istek atıyor,
-- ücretli her şarkı bittiğinde play_count artışı gözat ekranındaki herkese
-- mekanın BÜTÜN kataloğunu yeniden indirtiyordu (playlist senkronunda eklenen
-- satır başına bir kez). Üstelik postgres_changes her olayı her abone için
-- ayrıca RLS'ten geçirir; 50 telefonlu bir mekanda tek heartbeat 50 okuma.
--
-- YENİ YOL: tetikleyiciler yalnızca ANLAMLI değişikliklerde, deyim başına tek
-- bir Broadcast mesajı yollar (topic `venue-live:<venue_id>`). İstemci bu
-- mesajla yeniden okur — ama artık yalnızca bir şey gerçekten değiştiğinde.
-- Heartbeat ise veri çekmeyi tetiklemez: 20 sn'de bir `beat` mesajı, oynatıcının
-- açık olduğunu taşır (eşik 45 sn, bkz. lib/player-status.ts).
--
-- Kanal herkese açık (private=false): taşıdığı bilgi müşterinin zaten okuyabildiği
-- kuyruk/çalan şarkı durumu. Admin paneli ve player postgres_changes'i
-- kullanmaya devam eder (mekan başına 1-2 abone), yayın tablosu değişmedi.

-- Yayın hatası asıl yazmayı ASLA düşürmemeli: kuyruğa ekleme, çalma ilerlemesi
-- mesaj gitmedi diye geri alınmaz. İstemciler zaten yeniden bağlanışta ve
-- sekme uyanışında kaynaktan bir kez okur.
create or replace function public.venue_live_send(
  p_venue_id uuid,
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_venue_id is null then
    return;
  end if;
  perform realtime.send(p_payload, p_event, 'venue-live:' || p_venue_id::text, false);
exception when others then
  raise warning 'venue_live_send(%, %): %', p_venue_id, p_event, sqlerrm;
end;
$$;

revoke execute on function public.venue_live_send(uuid, text, jsonb) from public, anon, authenticated;

-- ── queue ────────────────────────────────────────────────────────────────────
-- Deyim düzeyinde: fillQueue'nun yüzlerce satırlık tek insert'i tek mesaj olur.
-- INSERT mesajı eklenen müşteri şarkılarını da taşır (bildirim izleyicisi
-- "kuyruğa şarkı eklendi" bildirimini bununla atar; kuyruk satırı zaten
-- müşteriye okunabilir, yeni bir bilgi açılmıyor).
create or replace function public.queue_live_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
  added jsonb;
begin
  if tg_op = 'DELETE' then
    for v in select distinct venue_id from old_rows loop
      perform public.venue_live_send(v, 'queue', jsonb_build_object('op', 'delete'));
    end loop;
  elsif tg_op = 'INSERT' then
    for v in select distinct venue_id from new_rows loop
      select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'song_id', r.song_id)), '[]'::jsonb)
        into added
        from (
          select user_id, song_id from new_rows
           where venue_id = v and user_id is not null
           limit 10
        ) r;
      perform public.venue_live_send(v, 'queue', jsonb_build_object('op', 'insert', 'added', added));
    end loop;
  else
    for v in select distinct venue_id from new_rows loop
      perform public.venue_live_send(v, 'queue', jsonb_build_object('op', 'update'));
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists queue_live_insert on public.queue;
create trigger queue_live_insert
  after insert on public.queue
  referencing new table as new_rows
  for each statement execute function public.queue_live_notify();

drop trigger if exists queue_live_update on public.queue;
create trigger queue_live_update
  after update on public.queue
  referencing new table as new_rows
  for each statement execute function public.queue_live_notify();

drop trigger if exists queue_live_delete on public.queue;
create trigger queue_live_delete
  after delete on public.queue
  referencing old table as old_rows
  for each statement execute function public.queue_live_notify();

-- ── now_playing ──────────────────────────────────────────────────────────────
-- Satır düzeyinde (mekan başına tek satır). İki tür mesaj:
--   np   — müşterinin gördüğü şey değişti: şarkı, çal/duraklat ya da çapa 2 sn'den
--          fazla kaydı (sarma, uzun tamponlama). Her heartbeat started_at'i
--          milisaniyelerle yeniden çapaladığı için küçük kaymalar sayılmaz.
--   beat — yalnızca oynatıcı canlılığı: heartbeat 20 sn'lik bir dilimden
--          diğerine geçince bir kez. Kapalı player'ın ilk heartbeat'i (eski
--          değer 45 sn'den eski) her zaman yeni dilimdedir → "açıldı" anında gider.
create or replace function public.now_playing_live_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meaningful boolean;
  beat boolean;
begin
  if tg_op = 'INSERT' then
    meaningful := true;
    beat := false;
  else
    meaningful :=
      new.song_id is distinct from old.song_id
      or new.video_id is distinct from old.video_id
      or new.is_playing is distinct from old.is_playing
      or (new.started_at is null) <> (old.started_at is null)
      or abs(extract(epoch from (new.started_at - old.started_at))) > 2;
    beat :=
      new.last_heartbeat_at is not null
      and (
        old.last_heartbeat_at is null
        or floor(extract(epoch from new.last_heartbeat_at) / 20)
           <> floor(extract(epoch from old.last_heartbeat_at) / 20)
      );
  end if;

  if meaningful then
    perform public.venue_live_send(new.venue_id, 'np', jsonb_build_object(
      'song_id', new.song_id,
      'video_id', new.video_id,
      'is_playing', new.is_playing,
      'started_at', new.started_at,
      'last_heartbeat_at', new.last_heartbeat_at
    ));
  elsif beat then
    perform public.venue_live_send(new.venue_id, 'beat', jsonb_build_object(
      'last_heartbeat_at', new.last_heartbeat_at
    ));
  end if;
  return null;
end;
$$;

drop trigger if exists now_playing_live on public.now_playing;
create trigger now_playing_live
  after insert or update on public.now_playing
  for each row execute function public.now_playing_live_notify();

-- ── venue_songs ──────────────────────────────────────────────────────────────
-- Müşterinin seçebileceği katalog değişti mi? play_count tek başına SAYILMAZ:
-- her ücretli şarkı bitişinde artıyor ve eskiden gözat ekranındaki herkese
-- bütün kataloğu yeniden indirtiyordu. "En çok çalınanlar" bir sonraki
-- açılışta/yeniden bağlanışta tazelenir.
create or replace function public.venue_songs_live_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if tg_op = 'DELETE' then
    for v in select distinct venue_id from old_rows loop
      perform public.venue_live_send(v, 'catalog');
    end loop;
  elsif tg_op = 'INSERT' then
    for v in select distinct venue_id from new_rows loop
      perform public.venue_live_send(v, 'catalog');
    end loop;
  else
    for v in
      select distinct n.venue_id
        from new_rows n
        join old_rows o on o.id = n.id
       where n.in_venue_list is distinct from o.in_venue_list
          or n.playlist_visible is distinct from o.playlist_visible
          or n.song_id is distinct from o.song_id
    loop
      perform public.venue_live_send(v, 'catalog');
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists venue_songs_live_insert on public.venue_songs;
create trigger venue_songs_live_insert
  after insert on public.venue_songs
  referencing new table as new_rows
  for each statement execute function public.venue_songs_live_notify();

drop trigger if exists venue_songs_live_update on public.venue_songs;
create trigger venue_songs_live_update
  after update on public.venue_songs
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.venue_songs_live_notify();

drop trigger if exists venue_songs_live_delete on public.venue_songs;
create trigger venue_songs_live_delete
  after delete on public.venue_songs
  referencing old table as old_rows
  for each statement execute function public.venue_songs_live_notify();

-- ── one_time_songs ───────────────────────────────────────────────────────────
-- Onaylanan taleplerin 10 dakikalık tek seferlik hakları (bkz. 0045).
create or replace function public.one_time_songs_live_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if tg_op = 'DELETE' then
    for v in select distinct venue_id from old_rows loop
      perform public.venue_live_send(v, 'one_time');
    end loop;
  else
    for v in select distinct venue_id from new_rows loop
      perform public.venue_live_send(v, 'one_time');
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists one_time_songs_live_insert on public.one_time_songs;
create trigger one_time_songs_live_insert
  after insert on public.one_time_songs
  referencing new table as new_rows
  for each statement execute function public.one_time_songs_live_notify();

drop trigger if exists one_time_songs_live_update on public.one_time_songs;
create trigger one_time_songs_live_update
  after update on public.one_time_songs
  referencing new table as new_rows
  for each statement execute function public.one_time_songs_live_notify();

drop trigger if exists one_time_songs_live_delete on public.one_time_songs;
create trigger one_time_songs_live_delete
  after delete on public.one_time_songs
  referencing old table as old_rows
  for each statement execute function public.one_time_songs_live_notify();
