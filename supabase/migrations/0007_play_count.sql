-- play_count hiçbir yerde artırılmıyordu (insert'te 0 yazılıp öyle kalıyordu) —
-- gözat sayfasındaki "En Çok Çalınanlar" bu yüzden hep boştu.
-- Çözüm: kuyrukta 'played' durumuna geçen her kullanıcı şarkısında venue_songs.play_count'u
-- artıran trigger + mevcut çalma geçmişinden geriye dönük doldurma.
-- Not: user_id null (auto-fill) çalmalar sayılmaz — RPC'lerdeki recently_played filtresiyle tutarlı.

create or replace function public.bump_play_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'played'
     and (tg_op = 'INSERT' or old.status is distinct from 'played')
     and new.user_id is not null
  then
    update public.venue_songs
      set play_count = play_count + 1
      where venue_id = new.venue_id and song_id = new.song_id;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_bump_play_count on public.queue;
create trigger queue_bump_play_count
  after insert or update of status on public.queue
  for each row execute function public.bump_play_count();

-- Geriye dönük doldurma: mevcut çalma geçmişinden say
update public.venue_songs vs
set play_count = sub.cnt
from (
  select venue_id, song_id, count(*)::int as cnt
  from public.queue
  where status = 'played' and user_id is not null
  group by venue_id, song_id
) sub
where sub.venue_id = vs.venue_id and sub.song_id = vs.song_id;
