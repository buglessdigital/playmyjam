import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Kök dizindeki geçici deneme betikleri
    ".tmp-*",
    // Playwright çıktıları
    "e2e-report/**",
    // node_modules'tan kopyalanan maplibre worker'ı (scripts/copy-maplibre-worker.mjs)
    "public/vendor/**",
    "e2e-results/**",
  ]),
]);

export default eslintConfig;
