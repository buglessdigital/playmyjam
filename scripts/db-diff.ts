#!/usr/bin/env node
/**
 * Prod ile test veritabanının (pmj-staging) yapısını karşılaştırır — yalnızca okur.
 *
 *   npm run db:diff
 *
 * NEDEN VAR
 * Supabase panelinden elle yapılan bir değişiklik (Realtime'a tablo eklemek,
 * bir politikayı düzeltmek…) migration dosyasına yazılmazsa test veritabanı
 * prod'dan sessizce sapar ve testler prod'da olmayan bir dünyayı dener. 0059
 * tam olarak böyle bulundu. Fark çıkarsa: değişikliği migration'a yazın.
 *
 * Karşılaştırılanlar: tablolar, kolonlar, fonksiyonlar (gövdeleriyle), RLS,
 * politikalar, indeksler, trigger'lar, yetkiler, Realtime yayını, eklentiler,
 * cron işleri. Veriler karşılaştırılmaz.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = join(import.meta.dirname, "..");

function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

const QUERIES: Record<string, string> = {
  tablolar: `select table_schema || '.' || table_name from information_schema.tables
             where table_schema = 'public' and table_type = 'BASE TABLE'`,
  kolonlar: `select table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable
                    || ' varsayılan=' || coalesce(column_default, '')
             from information_schema.columns where table_schema = 'public'`,
  fonksiyonlar: `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') '
                        || md5(pg_get_functiondef(p.oid))
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prokind = 'f'`,
  rls: `select relname || ' rls=' || relrowsecurity from pg_class c
        join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r'`,
  politikalar: `select schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' '
                       || coalesce(qual, '') || ' ' || coalesce(with_check, '')
                from pg_policies where schemaname in ('public', 'storage')`,
  indeksler: `select indexdef from pg_indexes where schemaname = 'public'`,
  triggerlar: `select event_object_table || ' ' || trigger_name || ' ' || action_timing || ' '
                      || event_manipulation
               from information_schema.triggers where trigger_schema in ('public', 'auth')`,
  tablo_yetkileri: `select grantee || ' ' || table_name || ' ' || privilege_type
                    from information_schema.role_table_grants
                    where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
  kolon_yetkileri: `select grantee || ' ' || table_name || '.' || column_name || ' ' || privilege_type
                    from information_schema.column_privileges
                    where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
  fonksiyon_yetkileri: `select routine_name || ' ' || grantee from information_schema.role_routine_grants
                        where routine_schema = 'public' and grantee in ('anon', 'authenticated')`,
  // realtime.messages_* günlük bölümleri Supabase'in kendisi açar — fark sayılmaz
  realtime: `select pubname || ' ' || schemaname || '.' || tablename from pg_publication_tables
             where schemaname = 'public'`,
  eklentiler: `select extname from pg_extension`,
  cron: `select jobname || ' ' || schedule || ' ' || command from cron.job`,
};

async function snapshot(url: string): Promise<Record<string, Set<string>>> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    const out: Record<string, Set<string>> = {};
    for (const [name, sql] of Object.entries(QUERIES)) {
      const { rows } = await client.query(sql);
      out[name] = new Set(rows.map((r) => String(Object.values(r)[0])));
    }
    return out;
  } finally {
    await client.end();
  }
}

const env = loadEnv(join(ROOT, ".env.new"));
if (!env.NEW_DB_URL || !env.STAGING_DB_URL) {
  console.error(".env.new içinde NEW_DB_URL ve STAGING_DB_URL gerekli");
  process.exit(1);
}

let prod: Record<string, Set<string>>;
let staging: Record<string, Set<string>>;
try {
  [prod, staging] = await Promise.all([snapshot(env.NEW_DB_URL), snapshot(env.STAGING_DB_URL)]);
} catch (err) {
  console.error(`Veritabanına bağlanılamadı: ${(err as Error).message}`);
  console.error("Ağınız 5432 portunu engelliyor olabilir — başka bir ağdan deneyin.");
  process.exit(1);
}

let differences = 0;
for (const name of Object.keys(QUERIES)) {
  const onlyProd = [...prod[name]].filter((x) => !staging[name].has(x));
  const onlyStaging = [...staging[name]].filter((x) => !prod[name].has(x));
  if (!onlyProd.length && !onlyStaging.length) {
    console.log(`✓ ${name} (${prod[name].size})`);
    continue;
  }
  differences += onlyProd.length + onlyStaging.length;
  console.log(`✗ ${name}`);
  for (const x of onlyProd) console.log(`    yalnız prod:    ${x.slice(0, 200)}`);
  for (const x of onlyStaging) console.log(`    yalnız staging: ${x.slice(0, 200)}`);
}

if (differences) {
  console.log(`\n${differences} fark var. Prod'daki elle yapılmış değişiklikleri migration'a yazın.`);
  process.exit(1);
}
console.log("\nİki veritabanının yapısı aynı.");
