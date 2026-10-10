import type { CapacitorConfig } from "@capacitor/cli";

// PlayMyJam mağaza uygulaması: kendi arayüzü YOK, canlı siteyi WebView'de açar.
// Müşteri tarafı web'le aynı kod — her Vercel deploy'u uygulamayı da günceller,
// mağaza güncellemesi yalnızca bu kabuk (eklenti, izin, ikon) değişince gerekir.
// Web tarafıyla sözleşme: lib/native-app.ts. Kararlar: docs/notlar/pmj-mobil-uygulama-2026-10.md

const config: CapacitorConfig = {
  // Mağazaya bir kez yüklenince DEĞİŞTİRİLEMEZ
  appId: "com.playmyjam.app",
  appName: "PlayMyJam",
  // Yalnızca site açılamazsa görünen yedek sayfa (bkz. www/index.html)
  webDir: "www",
  // Sunucu kullanıcı ajanından uygulamayı tanıyabilsin (istatistik, destek)
  appendUserAgent: "PlayMyJamApp",
  backgroundColor: "#0f0a18",
  server: {
    // Mekanlar listesi; son ziyaret edilen mekan varsa köprü oraya geçer
    // (bkz. components/native/NativeAppBridge.tsx)
    url: "https://playmyjam.com.tr/mekanlar",
    // WebView'de kalacak alan adları; geri kalanı sistem tarayıcısında açılır.
    // iyzico ödeme sayfası (Android) burada açılmalı ki dönüş uygulamaya gelsin.
    // DİKKAT: 3D Secure banka sayfaları listede değil — gerçek kartla test et.
    allowNavigation: ["playmyjam.com.tr", "*.playmyjam.com.tr", "*.iyzipay.com", "*.iyzico.com"],
  },
  ios: {
    // Çentik/ana çubuk boşluklarını site kendisi env(safe-area-inset-*) ile veriyor
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0f0a18",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f0a18",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
