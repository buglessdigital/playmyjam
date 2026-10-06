---
name: pmj-iyzico-marka-kiti-2026-07
description: "iyzico web sitesi kriterleri geri dönüşü: tek eksik iyzico ile Öde logosuydu, tamamlandı ve deploy edildi"
metadata: 
  node_type: memory
  type: project
  originSessionId: 02bf1624-1fb0-4a36-af2d-5cac287803d0
  modified: 2026-07-20T10:10:54.687Z
---

iyzico'nun "Gereken Web Sitesi Kriterleri" geri dönüşünde listelenen 7 şarttan 6'sı zaten koddaydı
(Hakkımızda, SSL, Teslimat/İade, Gizlilik, Mesafeli Satış, Visa/Mastercard logoları). Tek gerçek eksik
"iyzico ile Öde Logosu"ydu. Kullanıcı resmi iyzico marka kiti dosyalarını masaüstüne indirdi
(`checkout_iyzico_ile_ode/`, `footer_iyzico_ile_ode/`); bunlardan **beyaz** varyantlar
`public/payment/`e kopyalandı (site geneli koyu zeminli, renkli varyant okunmaz olurdu).

Elle çizilmiş `components/ui/CardLogos.tsx` (Tosla şartı için Visa/Mastercard/Troy) silindi, yerine
resmi "logo band" görselini taşıyan `components/ui/IyzicoBand.tsx` kondu (iyzico+Visa+Mastercard+
Troy+Amex tek görselde) — footer'lar ve ana sayfa vitrini. Ayrıca jeton satın alma ekranına
(`TokensClient.tsx`) "iyzico ile Öde" rozeti eklendi. Commit `8242b95`, prod'a deploy edildi;
`playmyjam.com.tr` artık aliaslı ve canlı (bkz [[pmj-prod-env]] — TRABİS yayılımı tamamlanmış).

**Why:** iyzico onayı bu kriter listesine bağlı; eksik kalan tek madde marka logosuydu.

**How to apply:** iyzico başvurusu/onayı tekrar gündeme gelirse bu maddenin tamamlandığını varsay;
yeni bir ret gelirse önce gerçek ödeme entegrasyonunun hâlâ simülasyon olduğunu hatırla
(`app/api/venue/[venueId]/tokens/purchase/route.ts` — "ÖDEME SİMÜLASYONU" notu), bu görsel/sayfa
şartlarından ayrı bir konu.
