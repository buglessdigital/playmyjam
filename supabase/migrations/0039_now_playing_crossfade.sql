-- 0039: Crossfade — şarkı geçişlerinde çapraz solma (Spotify'daki gibi).
--
-- Çalan şarkının son N saniyesinde sıradaki şarkı başlar; çıkanın sesi 0'a iner,
-- girenin sesi mekanın ayarladığı seviyeye çıkar. Player bunu iki YouTube deck'i
-- (A/B) arasında yaparak gerçekleştirir.
--
-- Neden now_playing'de (venues'ta değil): player zaten bu satırı Realtime ile
-- dinliyor — ses seviyesiyle (0036) birebir aynı yol. venues'ta kolon bazlı
-- grant var (bkz. 0002), yeni kolon anon'a kapalı kalırdı.
--
-- 0 = crossfade kapalı (sert geçiş, eski davranış). Varsayılan 4 sn.
-- Üst sınır 12 sn: daha uzunu kısa şarkılarda geçişin şarkının yarısını yemesine
-- yol açıyor.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0038'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u. Kolon varsayılanlı olduğu için bu
-- SQL tek başına hiçbir şeyi bozmaz; eski kod kolonu hiç okumaz.

begin;

alter table public.now_playing
  add column if not exists crossfade_ms integer not null default 4000;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'now_playing_crossfade_ms_check'
  ) then
    alter table public.now_playing
      add constraint now_playing_crossfade_ms_check
      check (crossfade_ms between 0 and 12000);
  end if;
end
$$;

commit;
