#!/usr/bin/env node
/**
 * supabase/migrations altındaki SQL dosyalarını bir veritabanına sırayla uygular.
 *
 *   npm run db:migrate -- --target staging          # test projesi (STAGING_DB_URL)
 *   npm run db:migrate -- --target staging --dry    # yalnızca bekleyenleri listeler
 *   npm run db:migrate -- --target prod             # prod (NEW_DB_URL) — onay ister
 *
 * Bağlantı adresleri .env.new'den okunur (git'e girmez).
 *
 * NASIL ÇALIŞIR
 * Uygulanan dosyalar supabase_migrations.schema_migrations tablosuna yazılır —
 * Supabase CLI'ın kullandığı tablo, ileride CLI'a geçilirse kayıtlar geçerli kalır.
 * Her dosya kendi transaction'ında çalışır: hata verirse o dosya tamamen geri
 * alınır, betik durur ve sonrakilere geçmez.
 *
 * PROD'A İLK GEÇİŞ
 * Prod'daki migration'lar bugüne kadar SQL Editor'dan elle uygulandı, tabloda
 * kayıtları yok. --baseline <sürüm> o sürüme kadar olan dosyaları çalıştırmadan
 * "uygulandı" olarak işaretler; sonrası normal akar.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import pg from "pg";

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "supabase", "migrations");

const TARGETS: Record<string, string> = { staging: "STAGING_DB_URL", prod: "NEW_DB_URL" };

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

const target = value("--target");
if (!target || !TARGETS[target]) {
  console.error("Kullanım: npm run db:migrate -- --target staging|prod [--dry] [--baseline 0058]");
  process.exit(1);
}
const url = loadEnv(join(ROOT, ".env.new"))[TARGETS[target]];
if (!url) {
  console.error(`.env.new içinde ${TARGETS[target]} yok`);
  process.exit(1);
}

// "0044_dynamic_priority_cost.sql" → sürüm "0044", ad "dynamic_priority_cost"
const files = readdirSync(DIR)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort()
  .map((f) => {
    const [, version, name] = f.match(/^(\d+)_(.+)\.sql$/)!;
    return { file: f, version, name };
  });

const dupes = files.filter((f, i) => files.findIndex((g) => g.version === f.version) !== i);
if (dupes.length) {
  console.error("Aynı sürüm numarası birden fazla dosyada:", dupes.map((d) => d.file).join(", "));
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
try {
  await client.connect();
} catch (err) {
  // Ofis/kafe ağları Postgres portunu (5432) sık sık sessizce engeller: TCP
  // açılır ama sunucudan hiç yanıt gelmez. Site HTTPS kullandığı için etkilenmez.
  console.error(`Veritabanına bağlanılamadı: ${(err as Error).message}`);
  console.error("Ağınız 5432 portunu engelliyor olabilir — başka bir ağdan (ör. telefon hotspot'u) deneyin.");
  process.exit(1);
}

try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);
  const { rows } = await client.query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f.version));

  console.log(`${target}: ${applied.size} uygulanmış, ${pending.length} bekleyen`);
  for (const f of pending) console.log(`  · ${f.file}`);
  if (flag("--dry") || pending.length === 0) process.exit(0);

  const baseline = value("--baseline");
  if (target === "prod") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      baseline
        ? `PROD: ${baseline}'e kadarki dosyalar çalıştırılmadan işaretlenecek. Devam için "evet": `
        : `PROD'a ${pending.length} migration uygulanacak. Devam için "evet": `,
    );
    rl.close();
    if (answer.trim() !== "evet") process.exit(1);
  }

  for (const f of pending) {
    const skip = baseline !== undefined && f.version <= baseline;
    const sql = readFileSync(join(DIR, f.file), "utf8");
    await client.query("begin");
    try {
      if (!skip) await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [f.version, f.name, skip ? [] : [sql]],
      );
      await client.query("commit");
      console.log(`${skip ? "işaretlendi" : "uygulandı "}  ${f.file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`\nHATA  ${f.file}\n${(err as Error).message}`);
      process.exit(1);
    }
  }
} finally {
  await client.end();
}
