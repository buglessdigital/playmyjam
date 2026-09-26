import type * as Sentry from "@sentry/nextjs";

type DataCollection = NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>["dataCollection"]>;

// Sentry v11 varsayılanı çerez, başlık, istek gövdesi, sorgu parametresi ve
// yığındaki yerel değişkenleri toplar. Bizde bunlar oturum çerezleri, iyzico
// ödeme gövdeleri ve callback token'ları demek — KVKK ve güvenlik gereği hepsi
// kapalı. Hata ayıklamak için yığın izi + route yeterli.
export const SENTRY_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
};

// Performans izlerinin gönderilen payı — ücretsiz planın aylık kotası dolmasın
export const SENTRY_TRACES_SAMPLE_RATE = 0.1;
