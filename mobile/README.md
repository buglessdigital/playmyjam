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

## İkon ve açılış ekranı

Kaynak `assets/logo-mark.svg` (public/logo-mark.png'nin vektörü):

```bash
node assets/build-sources.mjs   # 1024 px ikon + 2732 px açılış kaynakları
npm run assets                  # platform boyutlarına böler
```

## Hesaba özel dosyalar (repoya girmez)

- `android/app/google-services.json` — Firebase (Android push)
- `ios/App/App/GoogleService-Info.plist` — Firebase (iOS push, istenirse)
