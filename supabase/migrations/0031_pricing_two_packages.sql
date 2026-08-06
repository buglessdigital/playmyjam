-- 0031: Yeni jeton fiyatlandırması — birim fiyat 40 TL, yalnızca iki paket:
--   1 jeton  = 40 TL  (birim fiyatla aynı)
--   3 jeton  = 100 TL (popüler, ~%17 avantaj)
-- Eski paketler (Başlangıç/Popüler/Süper/Mega) tamamen kaldırılır.
-- Yalnızca veri günceller; şema değişikliği yoktur, tekrar tekrar çalıştırılabilir.

begin;

insert into public.app_settings (key, value, updated_at)
values ('token_unit_price', to_jsonb(40), now())
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Önce sil sonra ekle: tek-popüler partial unique index geçici çakışma görmesin
delete from public.global_token_packages;

insert into public.global_token_packages (label, tokens, price, popular, display_order)
values
  ('Tek Jeton', 1, 40::numeric(10,2),  false, 1),
  ('3 Jeton',   3, 100::numeric(10,2), true,  2);

commit;
