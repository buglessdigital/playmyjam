---
name: pmj-sorunlar-ekrani-2026-09
description: Super admin /super-admin/issues — bildirimlerin akıbeti (push_deliveries) + sunucunun yakaladığı hatalar (system_events); 0061 ŞART
metadata:
  type: project
---

29 Eyl 2026. Kullanıcının isteği: mekanda müşteriye "şarkın çalıyor" ya da admine "yeni talep" bildirimi gitmediğinde — ve genel olarak her türlü sessiz arızada — bunu super admin'den (ve Sentry'den) görebilmek. Öncesinde `lib/push.ts` hataları ve "cihazı yok" durumlarını iz bırakmadan yutuyordu; ~150 `catch` Sentry'ye hiç ulaşmıyordu.

**Bildirim kaydı (push_deliveries):** her `sendPushTo*` çağrısı TEK satır. Satır gönderimden ÖNCE `failed / "tamamlanmadı"` olarak açılır, sonra sonuçla güncellenir — fonksiyon yarıda kesilirse iz kalır ve service worker'ın onayı satırı hazır bulur. Durumlar: sent / partial / failed / no_device (izin yok ya da bütün abonelikler 404/410) / not_configured (VAPID yok). `deliveryId` bildirimin `data`'sına iner; `public/sw.js` gösterince `shown`, dokununca `clicked` diye `/api/push/ack`'e yollar (oturumsuz, yalnız zaman damgası). **"sent" = push servisi kabul etti, telefonda göründü DEĞİL** — kanıtı `shown_at`. 5 dk'da onay gelmezse ekranda "Doğrulanmadı". Eski sw.js'li cihazlar güncellenene kadar onay yollamaz → ilk günlerde "Doğrulanmadı" şişkin görünebilir.

**Sistem kaydı (system_events):** `reportIssue()` (lib/ops-log.ts) hem tabloya hem Sentry'ye yazar. Bağlı noktalar: iyzico callback (sorgu hatası, sipariş yok, imza, kart reddi=warn, **confirm_payment_order hatası** — eskiden sonucu hiç kontrol edilmiyordu, "para çekildi jeton yüklenmedi"), checkout başlatma, iki cron, bildirim hazırlığı hataları, `fillQueue` hataları, `instrumentation.ts onRequestError` (yalnız VERCEL_ENV=production, sorgu dizesi yazılmaz).

**Düzeltilen gizli hata:** "şarkın çalıyor" ve "önerin eklendi" bildirimleri sahipsiz promise'ti; Vercel yanıt dönünce fonksiyonu dondurabildiği için yarıda kalabiliyordu → `runInBackground()` (lib/background.ts, `after()`; istek bağlamı yoksa düz koşar).

Saklama 30 gün (youtube-refresh cron'u siler). Özet `ops_summary` RPC'sinde (1000 satır tavanı yüzünden). Staging'de test yöntemi: sahte abonelik endpoint'i olarak `https://httpbin.org/status/201|410|500` + yerelde üretilmiş p256dh/auth + geçici VAPID anahtarı; `JITI_ALIAS='{"@/":"<repo>/"}' npx jiti` ile lib'i doğrudan çağır.

Sırada: Sentry uyarı kuralları (panelden), Sentry Crons (cron hiç çalışmazsa haber), istemci tarafı (player) hatalarının da buraya düşmesi. Bkz. [[pmj-saglik-ekrani-2026-09]], [[pmj-profesyonellesme-2026-09]], [[pmj-push-stats-2026-07]].
