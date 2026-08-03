-- 0027: Tek oynatıcı kilidi — aynı mekanda iki player sekmesi/cihazı çift ses yapmasın.
--
-- Sorun: /admin/{slug}/player sayfası birden fazla sekmede (panelde "Player'ı Aç"
-- her tıklamada yeni sekme açıyordu) veya TV + laptop gibi iki cihazda açıldığında
-- ikisi de aynı videoyu yükleyip çalıyor (yankılı çift ses), ikisi de şarkı bitince
-- kuyruğu ilerletiyordu (şarkılar ikişer atlanıyordu).
--
-- Çözüm: mekanın "çalma sahibi" now_playing satırında tutulur.
--   * player_claim    — sahiplik alan player örneğinin kimliği (her sekme kendi üretir)
--   * player_claim_at — sahibin son heartbeat'i; bayatlarsa (cihaz kapandı, ağ gitti)
--                       sahiplik serbest kalır ve yeni player devralabilir
--
-- Sahiplik yalnızca oynatmayı bağlar. Admin panelindeki çal/duraklat/sonraki
-- komutları claim taşımaz ve etkilenmez — onlar tek bir komuttur, ses üretmez.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0026'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (kolonlar nullable, eski kod bunları
-- hiç okumadığı için bu SQL tek başına hiçbir şeyi bozmaz).

begin;

alter table public.now_playing
  add column if not exists player_claim    text,
  add column if not exists player_claim_at timestamptz;

commit;
