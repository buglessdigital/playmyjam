import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, SENTRY_TRACES_SAMPLE_RATE } from "@/lib/sentry-options";

// Sunucu tarafı hata takibi: Node fonksiyonları, proxy ve Next'in yakaladığı
// istek hataları (Server Component, route handler, server action) Sentry'ye düşer.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: process.env.NODE_ENV === "production",
      environment: process.env.VERCEL_ENV ?? "development",
      dataCollection: SENTRY_DATA_COLLECTION,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
