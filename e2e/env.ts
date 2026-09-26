// E2E testleri test Supabase projesi (pmj-staging) + iyzico sandbox'a karşı
// çalışır. Anahtarlar .env.new'den okunur (git'e girmez); prod'a asla bağlanmaz.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvNew(): Record<string, string> {
  const out: Record<string, string> = {};
  // Playwright ayarı CommonJS olarak yüklüyor (import.meta yok); komutlar kök dizinden çalışır
  const file = join(process.cwd(), ".env.new");
  // CI'da dosya yok; değerler ortam değişkeni (GitHub secret) olarak gelir
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

const src = { ...loadEnvNew(), ...process.env };

function need(name: string): string {
  const v = src[name];
  if (!v) throw new Error(`E2E için ${name} gerekli (.env.new ya da ortam değişkeni)`);
  return v;
}

export const E2E = {
  dbUrl: need("STAGING_DB_URL"),
  /** Test sunucusuna verilecek ortam — .env.local'daki prod/canlı değerleri ezer */
  serverEnv: {
    NEXT_PUBLIC_SUPABASE_URL: need("STAGING_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: need("STAGING_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: need("STAGING_SERVICE_ROLE_KEY"),
    IYZICO_API_KEY: need("STAGING_IYZICO_API_KEY"),
    IYZICO_SECRET_KEY: need("STAGING_IYZICO_SECRET_KEY"),
    IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com",
    NEXT_PUBLIC_SENTRY_DSN: "",
  },
};

export const E2E_PORT = 3100;
