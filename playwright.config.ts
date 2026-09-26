import { defineConfig, devices } from "@playwright/test";
import { E2E, E2E_PORT } from "./e2e/env";

// Uçtan uca testler: site test veritabanı (pmj-staging) + iyzico sandbox ile
// yerelde derlenip başlatılır, robot tarayıcı müşteri akışını baştan sona dener.
// Çalıştırma: npm run e2e  (ilk koşuda derleme ~1-2 dk sürer)
export default defineConfig({
  testDir: "./e2e",
  // Testler aynı test mekanını paylaşıyor — sıra karışmasın
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    ...devices["iPhone 13"],
    // Müşteriler mekanda telefondan giriyor; Chromium ile iPhone ekranı taklit edilir
    browserName: "chromium",
    locale: "tr-TR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "e2e-results",
  webServer: {
    command: `npx next build && npx next start -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: E2E.serverEnv,
    stdout: "ignore",
    stderr: "pipe",
  },
});
