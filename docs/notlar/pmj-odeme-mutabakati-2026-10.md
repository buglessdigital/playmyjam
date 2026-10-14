---
name: pmj-odeme-mutabakati-2026-10
description: "15 dk'da bir cron, iyzico dönüşü gelmeyen siparişleri sipariş kimliğiyle sorar: ödenmişse jeton yükler, yarıda kalanı kapatır; migration yok"
metadata:
  type: project
---

15 Eki 2026: `/api/cron/payment-reconcile` (vercel.json, `*/15 * * * *`) eklendi. Jeton eskiden yalnız müşterinin tarayıcısı iyzico'dan callback'e dönünce yükleniyordu; dönüş sayfası yüklenmeden telefon kapanırsa para çekilip sipariş sonsuza dek `pending` kalabilirdi.

- **Sorgu:** iyzico `/payment/detail` + `paymentConversationId = order.id` (checkout'ta conversationId ve basketId sipariş kimliği). Checkout form token'ı GEREKMEZ — bu yüzden geçmiş siparişler de sorgulanabiliyor. Yalnız okuma, para hareketi yok.
- **Gerçek yanıt biçimleri (canlıda ölçüldü):** ödenmiş → `status:success, paymentStatus:SUCCESS`; banka reddi → `paymentStatus:FAILURE` (errorCode 10220); form açılıp kapatılmış → `errorCode 5087` "ödeme kaydı bulunamadı"; 3D Secure yarıda → `status:success` ama `paymentStatus:INIT_THREEDS` (para çekilmemiş — `status`'a bakıp jeton yükleme!).
- **Karar** `lib/payment-decision.ts` (testli): SUCCESS + sepet + tutar tutuyorsa `confirm_payment_order` (tekrar çağrıya dayanıklı, callback'le yarışsa da jeton bir kez) + müşteriye "Jetonların yüklendi" push'u + Sorunlar'a `payment_recovered`; tutar/sepet uyuşmazsa YÜKLEMEZ, `reconcile_mismatch` hatası; 5087/INIT_THREEDS 1 saati geçince `failed` (`raw_response.reconcile = "abandoned"`); tanınmayan yanıt dokunulmaz.
- Pencere: 15 dk'dan eski, 30 günden genç `pending`'ler, tur başına 40.
- **15 Eki taraması:** 47 bekleyen siparişin hiçbiri ödenmemişti (37 kayıt yok, 7 3DS yarıda, 2 ret) — 11 Eki "Android'de gerçek kartla ödeme tamamlandı" testi iyzico'da kayıtlı DEĞİL; o üç sipariş 5087.
- `payment_orders.status` kısıtı yalnız pending/success/failed — yarıda bırakılan ayrı durum değil, `failed` + raw işareti. Siparişler müşteri arayüzünde gösterilmiyor; hakediş yalnız `success`'e bakıyor.

**Why:** Mekanlar açılınca "param çekildi jeton gelmedi" tek bir vaka bile güven kaybı; şansa bırakılmamalı.
**How to apply:** Sorunlar ekranında `payment_recovered` görülürse callback yolu bir yerde kopuyor demektir (en olası: uygulama içi 3DS dönüşü) — tekrar ediyorsa kök sebebe bak. Bkz. [[pmj-iyzico-payment-integration-2026-07]], [[pmj-iyzico-vercel-engel-2026-09]], [[pmj-sorunlar-ekrani-2026-09]].
