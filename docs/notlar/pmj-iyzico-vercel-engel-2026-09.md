---
name: pmj-iyzico-vercel-engel-2026-09
description: Canlı ödeme 17-21 Eyl 2026 çalışmadı — Vercel'in Node 24.20'sinden iyzico'ya TLS 1.3 bağlantısı ECONNRESET; TLS 1.2 + yeniden deneme ile çözüldü (lib/iyzico.ts)
metadata:
  type: project
---

17 Eyl 2026 Vercel hesap taşımasından sonra canlıda "Ödeme başlatılamadı" (`fetch failed … read ECONNRESET`); lokalde aynı kod çalışıyordu. 21 Eyl'de preview'a geçici teşhis ucu koyarak ölçüldü:
- IP/bölge değil (fra1/iad1/dub1 hepsi aynı), env değil (anahtarsız /payment/test de kopuyordu), sandbox kopmuyor.
- Vercel runtime Node 24.20 / OpenSSL 3.5.7 (lokal 24.12 / 3.5.4). Varsayılan TLS 1.3 el sıkışması api.iyzipay.com ve cpp.iyzipay.com'da sık kopuyor; `maxVersion: "TLSv1.2"` 20/20 geçti. ecdhCurve kısıtlaması tutarsızdı.
- Soğuk başlangıçta TLS 1.2 de ilk ~2 sn kopabiliyor → el sıkışmada (yanıt gelmeden) ECONNRESET olursa 6 denemeye kadar artan beklemeyle yeniden deneniyor.

Çözüm lib/iyzico.ts `withHttpsTransport` (node:https, TLS 1.2, retry). Önceden kullanıcının "sorun iyzico'da" açıklamasını reddedip "bizde" demesi doğru çıktı.

**How to apply:** Ödeme başlatılamıyorsa önce Vercel logunda ECONNRESET var mı bak. TLS ayarını kaldırmadan önce Vercel'den (preview + `vercel curl`, tek kullanımlık token'lı geçici route) tekrar ölç. Hobby'de log 1 saat — canlı testte `vercel logs --follow`. Bkz. [[pmj-iyzico-payment-integration-2026-07]].

**21 Eyl 2026 14:03 UTC — canlıda gerçek kartla ödeme BAŞARILI** (payment_orders status=success, paymentStatus=SUCCESS), TLS 1.2 düzeltmesinden (b.kz. [[pmj-iyzico-vercel-engel-2026-09]]) sonra. Uçtan uca akış doğrulandı.
