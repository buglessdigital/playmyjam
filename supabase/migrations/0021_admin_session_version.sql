-- Admin oturumu imzalı çerezde taşınıyor ve stateless: şifre değişse bile eski
-- çerez süresi dolana kadar (7 gün) geçerli kalıyordu, "tüm cihazlardan çıkış"
-- diye bir şey yoktu.
--
-- session_version bunu çözer: çerezin içine basılan sürüm ile satırdaki sürüm
-- uyuşmazsa oturum reddedilir. Sürümü artırmak, o admine ait tüm çerezleri
-- anında geçersiz kılar.

alter table public.venue_admins
  add column if not exists session_version integer not null default 1;

notify pgrst, 'reload schema';
