---
name: pmj-mobil-uygulama-2026-10
description: iOS/Android müşteri uygulaması — Capacitor kabuğu + aynı web kodu; iOS'ta Apple IAP; geçene 1 hediye jeton (kayıtlı hesap + cihaz başına); 0076 ŞART
metadata:
  type: project
---

**Kararlar (9 Eki 2026, Taner):**
- **Capacitor kabuğu**, React Native DEĞİL: uygulama playmyjam.com.tr'yi WebView'de açar → web ile tam senkron, deploy = uygulama güncellemesi. Apple 4.2 ("sadece web sarmalayıcı") reddine karşı yerel özellikler şart: yerel push (APNs/FCM), QR okutma, titreşim, Universal/App Links.
- **Yalnız müşteri tarafı** mağazada; mekan paneli PWA olarak kalır.
- **iOS'ta jeton Apple IAP ile** (kural 3.1.1), Android + web iyzico. IAP gelene kadar iOS uygulamasında iyzico düğmesi gizli ("yakında"). Apple uygulamada web'e satın alma yönlendirmesini yasaklıyor — iOS'ta "web'den al" linki KOYMA.
- **Hediye: 1 jeton, yalnız kayıtlı hesap, hesap başına + cihaz başına bir kez.** Misafir alamaz (yoksa her misafir oturumu bir jeton). 'grant' türüyle yazılır → 0057 gereği ücretsiz, hakedişe girmez.

**Aşama 1 (sunucu, yapıldı):** 0076 (`app_gift_claims` + `claim_app_gift`, yalnız service_role), `/api/app/gift` (GET nonce → POST kanıt), `lib/app-gift.ts`, `lib/native-app.ts` (köprü `window.Capacitor` üzerinden — web'e @capacitor paketi EKLENMEDİ), `components/native/NativeAppBridge.tsx` (derin bağlantı + hediye), `/auth/native-callback` (Google girişi sistem tarayıcısında → `playmyjam://auth/callback` → WebView'de olağan /auth/callback), `AppDownloadBanner` (mobil web şeridi).

**Tuzaklar:**
- Cihaz doğrulayıcı **fail-closed**: `verifyDeviceProof` Aşama 3'e kadar hep `not_configured` → hediye kimseye verilmez. Doğrulamasız açmak = jeton fabrikası.
- Cihaz kimliği yeniden kurulumda değişmemeli: iOS'ta App Attest anahtarı kurulum başına → kalıcılık için DeviceCheck bitleri; Android'de Play Integrity.
- Google OAuth gömülü WebView'de yasak (disallowed_useragent) — giriş hep sistem tarayıcısında.
- Supabase Auth → URL Configuration'a `https://playmyjam.com.tr/auth/native-callback` eklenmeli (prod + staging), yoksa Google dönüşü reddedilir.
- Şerit `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` tanımlanana kadar görünmez.
- Hesap silinince hediye satırı kalır (user_id null): cihaz özeti tekrarı engellemeye devam eder.

**Kabuğun sözleşmesi (Aşama 2):** appId `com.playmyjam.app`, şema `playmyjam://`, eklentiler App + Browser + kendi `PmjDevice.getProof({nonce})`.

**Sıradakiler:** Aşama 2 Capacitor projesi (Xcode + Android Studio kurulu değildi), Aşama 3 AASA/assetlinks + doğrulayıcılar + IAP makbuz doğrulama, Aşama 4 mağaza gönderimi. Hesaplar: Apple Developer (Bugless Digital, D-U-N-S), Play Console kuruluş. Bkz. [[pmj-akis-kisaltma-2026-08]], [[pmj-is-yonetimi-2026-09]].
