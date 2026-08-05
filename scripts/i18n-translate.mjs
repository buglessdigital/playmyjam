#!/usr/bin/env node
/**
 * TR sözlüğünü Google Cloud Translation API (v2) ile İngilizceye çevirir.
 *
 *   npm run i18n:translate          # sadece yeni/değişmiş anahtarları çevirir
 *   npm run i18n:translate -- --all # her şeyi baştan çevirir (elle düzeltmeleri ezer)
 *   npm run i18n:translate -- --dry # API'ye gitmeden ne yapacağını yazar
 *
 * Çalışma anında çağrılmaz: üretilen en.json commit edilir, site API'ye bağımlı değildir.
 *
 * en.source.json, her İngilizce metnin hangi Türkçe metinden üretildiğini tutar.
 * Türkçe metin değişmediği sürece o anahtar yeniden çevrilmez — böylece elle
 * düzelttiğin çeviriler bir sonraki çalıştırmada kaybolmaz.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DICT_DIR = join(ROOT, "lib/i18n/dictionaries");
const TR_PATH = join(DICT_DIR, "tr.json");
const EN_PATH = join(DICT_DIR, "en.json");
const SOURCE_PATH = join(DICT_DIR, "en.source.json");

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
const MAX_SEGMENTS = 100; // API sınırı 128
const MAX_CHARS = 8000; // istek başına güvenli üst sınır

const args = process.argv.slice(2);
const FORCE_ALL = args.includes("--all");
const DRY_RUN = args.includes("--dry");

/* ---------- yardımcılar ---------- */

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
    else if (typeof value === "string") out[path] = value;
    else throw new Error(`Sözlükte desteklenmeyen değer: ${path} (${typeof value})`);
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts.at(-1)] = value;
  }
  return out;
}

/* ---------- yer tutucu koruması ---------- */
// {isim} kalıplarını translate="no" ile sarıp HTML modunda çeviriyoruz;
// Google bu kısımlara dokunmuyor, sonrasında geri açıyoruz.

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const unescapeHtml = (text) =>
  text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function protect(text) {
  return escapeHtml(text).replace(
    /\{(\w+)\}/g,
    (_, name) => `<span translate="no">{${name}}</span>`
  );
}

function unprotect(text) {
  return unescapeHtml(text.replace(/<span translate="no">(.*?)<\/span>/g, "$1")).trim();
}

const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");

/* ---------- API ---------- */

async function translateBatch(texts, apiKey) {
  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: texts.map(protect),
      source: "tr",
      target: "en",
      format: "html",
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message ?? response.statusText;
    throw new Error(`Google Translation API ${response.status}: ${message}`);
  }
  return payload.data.translations.map((item) => unprotect(item.translatedText));
}

function chunk(entries) {
  const chunks = [];
  let batch = [];
  let chars = 0;
  for (const entry of entries) {
    if (batch.length >= MAX_SEGMENTS || chars + entry.tr.length > MAX_CHARS) {
      chunks.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(entry);
    chars += entry.tr.length;
  }
  if (batch.length) chunks.push(batch);
  return chunks;
}

/* ---------- ana akış ---------- */

async function main() {
  loadEnvLocal();

  const tr = flatten(readJson(TR_PATH, {}));
  const en = flatten(readJson(EN_PATH, {}));
  const source = readJson(SOURCE_PATH, {});

  // Silinen anahtarları temizle
  for (const key of Object.keys(en)) {
    if (!(key in tr)) {
      delete en[key];
      delete source[key];
    }
  }

  const pending = Object.entries(tr)
    .filter(([key, text]) => FORCE_ALL || !en[key] || source[key] !== text)
    .map(([key, text]) => ({ key, tr: text }));

  if (!pending.length) {
    console.log("✔ Sözlük güncel — çevrilecek yeni metin yok.");
    writeJson(EN_PATH, unflatten(en));
    writeJson(SOURCE_PATH, source);
    return;
  }

  const totalChars = pending.reduce((sum, entry) => sum + entry.tr.length, 0);
  const batches = chunk(pending);
  console.log(
    `${pending.length} metin (${totalChars} karakter) · ${batches.length} istek` +
      (DRY_RUN ? " — --dry, API'ye gidilmiyor" : "")
  );

  if (DRY_RUN) {
    for (const entry of pending) console.log(`  ${entry.key}: ${entry.tr}`);
    return;
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    console.error(
      "✖ GOOGLE_TRANSLATE_API_KEY tanımlı değil.\n" +
        "  .env.local dosyasına ekle:  GOOGLE_TRANSLATE_API_KEY=AIza..."
    );
    process.exit(1);
  }

  const warnings = [];
  let done = 0;

  for (const batch of batches) {
    const results = await translateBatch(
      batch.map((entry) => entry.tr),
      apiKey
    );
    batch.forEach((entry, index) => {
      const translated = results[index];
      if (placeholders(entry.tr) !== placeholders(translated)) {
        warnings.push(`${entry.key} — yer tutucu bozuldu: "${entry.tr}" → "${translated}"`);
      }
      en[entry.key] = translated;
      source[entry.key] = entry.tr;
    });
    done += batch.length;
    process.stdout.write(`\r  çevrildi: ${done}/${pending.length}`);
  }
  process.stdout.write("\n");

  writeJson(EN_PATH, unflatten(en));
  writeJson(SOURCE_PATH, source);

  console.log(`✔ ${EN_PATH.replace(`${ROOT}/`, "")} güncellendi.`);
  if (warnings.length) {
    console.warn(`\n⚠ ${warnings.length} anahtarı elle kontrol et:`);
    for (const warning of warnings) console.warn(`  ${warning}`);
  }
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
