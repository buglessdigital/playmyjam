import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
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

// Yakalanmamış sunucu hataları hem Sentry'ye (yığın izi, uyarı) hem super admin
// "Sorunlar" ekranına (0061 system_events) düşer. Yalnızca prod: önizleme ve
// yerel denemeler ekranı kirletmesin. Sorgu dizesi yazılmaz — onay jetonu gibi
// imzalı değerler taşıyabiliyor.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  Sentry.captureRequestError(err, request, context);
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL_ENV !== "production") return;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const message = err instanceof Error ? err.message : String(err);
    const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
    await supabaseAdmin.from("system_events").insert({
      area: "server",
      kind: `unhandled_${context.routeType}`,
      severity: "error",
      message: `${request.method} ${request.path.split("?")[0]} — ${message}`.slice(0, 500),
      detail: { route: context.routePath, digest },
    });
  } catch {
    // Kayıt yazılamazsa Sentry'deki kopya yeter
  }
};
