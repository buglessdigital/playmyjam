import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, SENTRY_TRACES_SAMPLE_RATE } from "@/lib/sentry-options";

// Tarayıcı hata takibi. Kişisel veri gönderilmez (bkz. lib/sentry-options.ts),
// oturum kaydı (replay) yok.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  dataCollection: SENTRY_DATA_COLLECTION,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  ignoreErrors: [
    // Tarayıcı eklentileri ve ağ kesintileri: bizim kodumuzla ilgisi yok,
    // mekan Wi-Fi'ı gidip gelince yüzlercesi birikir
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "AbortError",
  ],
  denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
