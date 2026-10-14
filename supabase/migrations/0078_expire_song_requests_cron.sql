-- 0078: Bekleyen şarkı talepleri 10 dakikada kendiliğinden kapanır.
--
-- Müşteriye "mekan 10 dakika içinde karar verir" deniyor; süresi geçmiş bir
-- talebi onaylamak işe yaramıyor. Şimdiye kadar expire_song_requests() yalnız
-- yeni talep/karar geldiğinde çağrılıyordu — başka hareket olmayan mekanda
-- talepler günlerce "Bekleyen"de kalıyordu. Ayrıca katalog şarkısı istekleri
-- (song_id dolu) expires_at'sız yazılıyordu, hiç dolmuyorlardı.
--
-- 1) expires_at boş satırlar requested_at + 10 dk ile değerlendirilir.
-- 2) pg_cron her dakika kapatır; UPDATE realtime ile admin paneline,
--    kenar çubuğu rozetine ve müşterinin durum şeridine kendiliğinden düşer.
--
-- Uygulama: kod sırası fark etmez (kod zaten expires_at yazıyor/okuyor).

begin;

create or replace function public.expire_song_requests(p_venue_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.song_requests
     set status = 'expired', resolved_at = now()
   where status = 'pending'
     and coalesce(expires_at, requested_at + interval '10 minutes') < now()
     and (p_venue_id is null or venue_id = p_venue_id);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

create extension if not exists pg_cron with schema pg_catalog;

-- Aynı adla tekrar çağrılırsa mevcut işi günceller (idempotent)
select cron.schedule(
  'expire-song-requests',
  '* * * * *',
  $$select public.expire_song_requests()$$
);

commit;
