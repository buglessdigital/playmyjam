---
name: pmj-iyzico-payment-integration-2026-07
description: iyzico Checkout Form entegrasyonu tamamlandı ve deploy edildi; jeton satın alma artık gerçek ödeme (simülasyon değil)
metadata: 
  node_type: memory
  type: project
  originSessionId: 02bf1624-1fb0-4a36-af2d-5cac287803d0
  modified: 2026-07-21T12:38:52.779Z
---

iyzico üye işyeri onayı sonrası (bkz. [[pmj-iyzico-marka-kiti-2026-07]]) gerçek ödeme entegrasyonu
tamamlandı. Önceki durum: `tokens/purchase` route'u `total`'ı hesaplayıp hiç kullanmadan (`void total;`)
doğrudan jeton ekliyordu (tam simülasyon). Yeni akış:

- `app/api/venue/[venueId]/tokens/checkout/route.ts` (eski `purchase` route'un yerine) — auth +
  tutar hesaplama aynı kaldı, artık `payment_orders` tablosuna `pending` sipariş yazıp iyzico
  Checkout Form Initialize'ı çağırıyor, `paymentPageUrl` dönüyor (jeton eklemiyor).
- `app/api/payments/iyzico/callback/route.ts` (yeni) — iyzico'nun POST callback'inden gelen `token`'ı
  `retrieveCheckoutForm` ile server-to-server doğruluyor, `SUCCESS` ise `confirm_payment_order` RPC'si
  (0017 migration, atomik `pending→success` guard'lı, `add_tokens`'ı çağırıyor) ile jetonu ekliyor.
- `lib/iyzico.ts` + `types/iyzipay.d.ts` — `iyzipay` npm paketi için @types/iyzipay yerine elle yazılmış
  dar kapsamlı tipler kullanıldı (community types checkoutFormInitialize'a yanlışlıkla paymentCard/
  installments zorunlu kılıyordu).
- **Önemli**: `iyzipay` paketi `fs.readdirSync` + dinamik `require()` kullanıyor, Turbopack bunu
  bundle edemiyor — `next.config.ts`'e `serverExternalPackages: ["iyzipay"]` eklendi, bu olmadan
  build patlıyor.
- `TokensClient.tsx`'e alıcı bilgisi (ad/soyad/T.C. kimlik no/şehir) mini formu eklendi — site sadece
  e-posta topluyordu, iyzico Checkout Form bunları zorunlu tutuyor; localStorage'da saklanıp
  önceden dolduruluyor. Satın alma artık `window.location.href` ile iyzico'nun sayfasına tam
  yönlendirme yapıyor, dönüşte `?payment=success|fail` query'si okunup bakiye/geçmiş yenileniyor.
- Migration 0017 kullanıcı tarafından Supabase SQL Editor'da koddan ÖNCE uygulandı (doğru sıra).
  Commit `0251713`, deploy edildi, `playmyjam.com.tr` üzerinde smoke test yapıldı (401/303 davranışları
  doğru) — **gerçek kartla uçtan uca satın alma testi henüz yapılmadı** (canlı/production hesap,
  kullanıcı kendi yapacak).
- iyzico env'leri (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL=https://api.iyzipay.com`)
  hem `.env.local`'e hem Vercel'in production+preview+development ortamlarına eklendi.

**Why:** iyzico onayından sonra tek eksik olan gerçek ödeme akışıydı; jeton artık iyzico onayı
olmadan asla eklenmiyor (çifte kredi riski `confirm_payment_order`'ın atomik guard'ıyla kapatıldı).

**How to apply:** Ödeme ile ilgili bug/rapor gelirse önce `payment_orders` tablosundaki ilgili
siparişin `status`/`raw_response` alanına bak. iyzico panelindeki API Anahtarı/Güvenlik Anahtarı bu
sohbette bir ekran görüntüsünde açığa çıkmıştı — kullanıcıya Güvenlik Anahtarı'nı panelden **Yenile**
ile değiştirmesi önerildi, yapıp yapmadığı teyit edilmedi.

**2026-07-21 — gerçek kartla ilk test: tüm ödemeler reddedildi ama SORUN KODDA DEĞİL.**
`raw_response`'ta hepsi aynı: `errorCode 10220` (= "Ödeme alınamadı", bankadan gelen genel red),
`errorGroup DECLINED`, ama `mdStatus:1` (3DS BAŞARILI) ve iyzico panel ödeme detayında Fraud Denetimi
"Düşük Fraud İhtimalli İşlem". Yani 3DS geçiyor + fraud düşük + entegrasyon iyzico'ya ulaşıyor
(paymentId üretiliyor) → reddi veren acquirer/banka tarafı, yeni onaylanmış hesabın canlı tahsilat
aktivasyonu henüz tamamlanmadığı için. Kullanıcı iyzico'ya ulaştı, **"sorun sizden değil, birkaç gün
içinde düzelecek" dediler**. Aksiyon: birkaç gün sonra aynı kartla tekrar dene, `payment_orders`'ta
`status: paid`/`success` görünce uçtan uca akış teyit edilmiş olur. Teşhis dersi: "ödeme alınmıyor"
gelince önce `raw_response.errorGroup`'a bak — DECLINED + mdStatus:1 + düşük fraud = hesap/acquirer
tarafı, kod değil.
