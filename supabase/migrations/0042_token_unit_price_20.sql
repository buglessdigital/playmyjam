-- 0042 — Tekli jeton fiyatı 20 TL; paket satışı kapalı.
--
-- 0031 birim fiyatı 40 TL yapıp iki paket (1 jeton / 3 jeton) tanımlıyordu.
-- Artık yalnızca tek jeton satılıyor: müşteri jeton sayfasında adedi kendisi
-- artırıyor, toplam = birim fiyat × adet (bkz. tokens/checkout route'u —
-- package_id gelmezse fiyatı buradaki app_settings satırından okur).
--
-- Not: canlı ortamda bu değişiklik super admin panelinden zaten yapıldı;
-- bu dosya sıfırdan kurulan ortamların aynı fiyatla açılması içindir.
-- Yalnızca veri günceller, tekrar tekrar çalıştırılabilir.

begin;

insert into public.app_settings (key, value, updated_at)
values ('token_unit_price', to_jsonb(20), now())
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 0031'in seed'lediği paketleri kaldır. Paket eklemek isteyen super admin
-- panelden ekleyebilir; tek jeton seçeneği paketlerden bağımsız her zaman durur.
delete from public.global_token_packages;

commit;
