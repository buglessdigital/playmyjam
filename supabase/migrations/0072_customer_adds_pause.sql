-- 0072: Mekan panelinden müşteri eklemelerini kapatma.
--
-- Mekan kapanmaya yakın müşterilerin sıraya jetonla şarkı eklemesini durdurmak
-- istiyor: kapanışa kadar çalınamayacak şarkıya jeton harcanmasın. Otomatik
-- doldurma ve panelden elle ekleme etkilenmez; yalnızca müşteri yolu
-- (/api/queue, talep gönderme) kapanır.
--
-- Bayrak değil ZAMAN DAMGASI: kapatma 12 saat sonra kendiliğinden düşer
-- (bkz. lib/customer-adds.ts). Gece kapatıp ertesi akşam açmayı unutan mekan
-- bütün gece jeton satışı kaçırmasın diye.
--
-- Neden now_playing'de (venues'ta değil): satır herkese okunabilir, müşteri
-- ekranlarının oynatıcı-açık kancası zaten bu satırı okuyor ve `np` yayınını
-- dinliyor; venues'ta kolon bazlı grant var (bkz. 0002 / 0036).
--
-- Uygulama: ÖNCE bu SQL, SONRA kod deploy'u. Kolon boş varsayılanlı ve eski
-- kod onu hiç okumadığı için SQL tek başına hiçbir şeyi değiştirmez.

begin;

alter table public.now_playing
  add column if not exists customer_adds_paused_at timestamptz;

-- 0060'taki tetikleyici; tek fark kapatma damgası da "anlamlı" sayılıyor ve
-- np mesajında taşınıyor — müşteri ekranları kapatmayı anında görsün.
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
      or abs(extract(epoch from (new.started_at - old.started_at))) > 2
      or new.customer_adds_paused_at is distinct from old.customer_adds_paused_at;
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
      'last_heartbeat_at', new.last_heartbeat_at,
      'customer_adds_paused_at', new.customer_adds_paused_at
    ));
  elsif beat then
    perform public.venue_live_send(new.venue_id, 'beat', jsonb_build_object(
      'last_heartbeat_at', new.last_heartbeat_at
    ));
  end if;
  return null;
end;
$$;

commit;
