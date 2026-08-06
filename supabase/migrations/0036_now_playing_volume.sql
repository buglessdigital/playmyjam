-- 0036: Ses seviyesi — mekan panelinden uzaktan kısılıp açılabilsin.
--
-- Bugüne kadar ses yalnızca player'ın açık olduğu cihazdan (YouTube iframe'inin
-- kendi kaydırıcısı ya da hoparlörün düğmesi) ayarlanabiliyordu. Mekan sahibi
-- barın arkasındaki tabletten/telefondan sesi değiştiremiyordu.
--
-- Komut yolu play/pause ile birebir aynı: panel /api/player'a yazar, now_playing
-- güncellenir, player Realtime ile duyup YT.setVolume çağırır. Ayrı bir kanal ya
-- da soket yok.
--
-- Neden now_playing'de (venues'ta değil): player zaten bu satırı dinliyor,
-- venues'ta kolon bazlı grant var (bkz. 0002) ve yeni kolon anon'a kapalı kalırdı.
--
-- 0 = tamamen kısık. Ayrı bir "mute" bayrağı YOK: sessize alma, paneldeki düğme
-- eski değeri hatırlayıp 0 yazarak yapılır — tek kaynak, senkron sorunu olmaz.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0035'ten SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u. Kolon varsayılanlı olduğu için bu
-- SQL tek başına hiçbir şeyi bozmaz; eski kod kolonu hiç okumaz.

begin;

alter table public.now_playing
  add column if not exists volume smallint not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'now_playing_volume_check'
  ) then
    alter table public.now_playing
      add constraint now_playing_volume_check
      check (volume between 0 and 100);
  end if;
end
$$;

commit;
