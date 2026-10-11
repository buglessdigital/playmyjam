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

**Aşama 2 başlangıcı (9 Eki 2026):** `mobile/` ayrı paket (Capacitor 8.5, kendi kilidi; kök tsconfig/eslint/.vercelignore hariç tutar). Açılış `/mekanlar`, köprü son mekana geçer (localStorage `pmj-app-last-venue`, oturumda bir kez). Android projesi + manifest (`playmyjam://` şeması, `/venue/` App Link autoVerify, kamera izni) ve ikon/açılış hazır — ikon `assets/logo-mark.svg`'den (512 px PNG büyütülmedi, vektör yeniden çizildi). iOS projesi 10 Eki'de eklendi (Xcode 27, SPM — CocoaPods yok), simülatör derlemesi geçti; Info.plist: `playmyjam` URL şeması, yalnız dikey, kamera izni metni, `ITSAppUsesNonExemptEncryption=false`. **Associated Domains (Universal Links) yetkisi EKLENMEDİ:** ücretsiz Apple ID ile imzalanamıyor — ücretli hesap gelince Xcode → Signing & Capabilities'ten `applinks:playmyjam.com.tr`. `/.well-known/apple-app-site-association` (`APPLE_TEAM_ID`) ve `/.well-known/assetlinks.json` (`ANDROID_CERT_SHA256`, virgülle çoklu) env boşken 404. Universal Link yalnız `/venue/*`; arka yüz QR'ı ve yasal sayfalar tarayıcıda kalır.
- **Tuzak:** kök layout'taki köprü `usePathname` okuduğu için `Suspense` içinde — cacheComponents'ta dinamik parametreli sayfada prerender'ı askıya alır.
- `allowNavigation` iyzico alan adlarını içeriyor, 3D Secure banka sayfalarını değil; **11 Eki 2026'da Android'de (Xiaomi, gerçek kart) test edildi: ödeme uygulama içinde tamamlandı, dönüş uygulamaya geldi.** Başka bir bankanın 3DS sayfası sistem tarayıcısına atlarsa dönüş uygulamaya gelmez — şikâyet gelirse ilk bakılacak yer.
- **Android derleme (10 Eki):** emülatörde çalıştı. Java 21 şart (barcode-scanner `jvmToolchain(21)`; Android Studio'nun Java 25'iyle Gradle 8.14 çalışmıyor) → `brew install openjdk@21` + `~/.gradle/gradle.properties`'te `org.gradle.java.home`. minSdk 24→26 (ionbarcode). Emülatör veri alanı 12 GB istiyor; disk dar olunca AVD `config.ini`'de `disk.dataPartition.size=4G`.
- **Mac:** Xcode macOS 26.6+ istiyor; bu Mac 9 Eki'de macOS 27'ye güncelleniyordu (15.6'dan). Disk 256 GB — Xcode için ~40 GB boş yer şart.

**Sıradakiler:** Aşama 2 Capacitor projesi (Xcode + Android Studio kurulu değildi), Aşama 3 AASA/assetlinks + doğrulayıcılar + IAP makbuz doğrulama, Aşama 4 mağaza gönderimi. Hesaplar: Apple Developer (Bugless Digital, D-U-N-S), Play Console kuruluş. Bkz. [[pmj-akis-kisaltma-2026-08]], [[pmj-is-yonetimi-2026-09]].

**Yerel özellikler (10 Eki 2026):** uygulamada (`useNativePlatform()`) vitrin üst menüsü/alt bilgisi mekan sahibi bağlantılarını (kayıt, panel girişi) çizmez, logo `/mekanlar`'a döner, "Mekanı Bul" yerine **Karekod Okut** (`components/native/ScanQrButton.tsx`, @capacitor/barcode-scanner köprüden — sarmalayıcı yok, enum değerleri elle: QR_CODE=0, BACK=1, PORTRAIT=1). Yalnız `https://playmyjam.com.tr` ön yüz (`/venue/<slug>`) ve arka yüz (`/<slug>/bilgi`) karekodları açılır (`qrToVenuePath`). Şarkı eklenince `nativeHaptic("success")` (gözat, şarkı detayı, geçmiş). Tarayıcıda hiçbiri değişmez. Bu iki özellik Apple 4.2'ye ("yalnız web sarmalayıcı") karşı ana kanıt.

**Push (11 Eki 2026, 0077 ŞART):** Firebase projesi = Google Cloud `play-my-jam-502210` (sahibi **taneryldrm112@gmail.com**, org `taneryks2022-org`; Spark planı). Org politikası servis hesabı anahtarını yasaklıyordu (`iam.disableServiceAccountKeyCreation`, legacy) → yalnız bu projede override + Off. Admin SDK anahtarı `FIREBASE_SERVICE_ACCOUNT_B64` (JSON'un base64'ü) Vercel'de 3 ortamda "sensitive", yerelde `.env.local` + `firebase-service-account.json` (gitignore'da; Bitwarden'a da konmalı). `firebase-admin` paketi YOK: `lib/fcm.ts` JWT'yi kendisi imzalar, HTTP v1'e tek istek. Müşteri bildirimleri `lib/push.ts` `deliver`'da web abonelikleri + `native_push_tokens` (yalnız android) AYNI gönderimde → tek push_deliveries satırı; yalnız uygulamaya gittiyse `shown_at` FCM kabulüyle dolar (OS gösterir, sw.js onayı yok). Uygulama tarafı `components/native/NativePush.tsx`: oturum açılınca izin (misafir dahil), kod `/api/push/native`'e (token unique, en son kullanıcıya taşınır), dokununca yükteki `url`. **iOS:** Capacitor iOS'ta APNs kodu verir (FCM değil) → kodlar saklanıyor ama gönderilmiyor; APNs anahtarı (ücretli hesap) gelince ya doğrudan APNs ya da Firebase iOS SDK. `google-services.json` `mobile/android/app/`'te, repoda değil.

**Mekan geçişi (11 Eki 2026):** uygulama hep son mekandan açıldığı için `/mekanlar` listesine (ve oradaki Karekod Okut'a) ulaşılamıyordu → uygulamada MEKANLAR haritasının başlığında **Karekod Okut**, mekan kartında (bulunulan mekan değilse) **"Bu mekana geç"** (`/venue/<slug>/browse`). Tarayıcıda harita yalnız keşif, düğmeler yok. **Tuzak:** köprünün `addListener`'ı Promise döndürmeyebilir — her zaman `Promise.resolve(...)` ile sar (#47, `.then is not a function` uygulamayı hata sayfasına düşürmüştü).

**Android yükleme anahtarı (11 Eki 2026):** `mobile/android/playmyjam-upload.jks` (RSA 4096, alias `playmyjam-upload`, ~27 yıl) + şifresi `keystore.properties` — ikisi de gitignore'da, yalnızca Taner'in Mac'inde (Bitwarden'a KONMADI, kullanıcı istemedi). Play App Signing açık olmalı → kaybolursa Play Console'dan yükleme anahtarı sıfırlanır, felaket değil. `./gradlew bundleRelease` imzalı AAB üretir. Uygulama köprüsü `NativeErrorBoundary` içinde (köprü hatası sayfayı düşürmez, Sentry `area: native-bridge`).
