# PlayMyJam mobil kabuğu (Capacitor)

iOS/Android müşteri uygulaması. Kendi arayüzü yok: `capacitor.config.ts`'teki
`server.url` ile canlı siteyi WebView'de açar; web deploy'u = uygulama güncellemesi.
Web tarafıyla sözleşme `lib/native-app.ts`, kararlar
`docs/notlar/pmj-mobil-uygulama-2026-10.md`.

Bu klasör kök projeden bağımsız bir pakettir (kendi `package-lock.json`'ı);
kökteki lint/tsc/Vercel derlemesine girmez.

## Kurulum

```bash
cd mobile
npm install
npx cap sync          # eklenti/ayar değişikliğinden sonra
npm run android       # Android Studio'da açar
npm run ios           # Xcode'da açar
```

## Android derleme notları

- **Java 21 şart.** `@capacitor/barcode-scanner` Kotlin derlemesini tam olarak
  Java 21 istiyor (`jvmToolchain(21)`); Android Studio Java 25 ile geliyor ve
  Gradle 8.14 onunla derleme betiğini işleyemiyor. Mac'te:
  `brew install openjdk@21`, sonra `~/.gradle/gradle.properties` içine
  `org.gradle.java.home=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
- **minSdk 26** (Android 8.0): barkod kütüphanesi (ionbarcode) daha düşüğünü kabul etmiyor.
- Komut satırından: `cd android && ./gradlew assembleDebug`
  (`ANDROID_HOME=~/Library/Android/sdk` ve `JAVA_HOME` Java 21 — `gradlew` kendini başlatmak için `org.gradle.java.home`'a değil `JAVA_HOME`'a bakar).

## Mağaza sürümü (Android)

```bash
cd android && ./gradlew bundleRelease   # app/build/outputs/bundle/release/app-release.aab
```

İmza `android/keystore.properties` + `android/playmyjam-upload.jks` ile atılır;
ikisi de repoda DEĞİL, yalnızca anahtarın üretildiği Mac'te. Bu bir **yükleme
anahtarı**: Play Console'da "Play App Signing" açık kalmalı (asıl imzayı Google
atar). Anahtar kaybolursa Play Console → Uygulama bütünlüğü → yükleme anahtarını
sıfırlama isteğiyle yenisi tanımlanır. Dosyalar yoksa release imzasız çıkar.

## İkon ve açılış ekranı

Kaynak `assets/logo-mark.svg` (public/logo-mark.png'nin vektörü):

```bash
node assets/build-sources.mjs   # 1024 px ikon + 2732 px açılış kaynakları
npm run assets                  # platform boyutlarına böler
```

## Hesaba özel dosyalar (repoya girmez)

- `android/app/google-services.json` — Firebase (Android push)
- `ios/App/App/GoogleService-Info.plist` — Firebase (iOS push, istenirse)
