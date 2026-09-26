// Dinamik öncelikli ücretin testi. Ekranda gösterilen fiyat (burası) ile kesilen
// fiyat (SQL priority_cost_now) ayrı yerlerde yazılı; son test ikisinin aynı
// adımı kullandığını migration dosyasından okuyarak doğrular.
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { normalQueuedCount, priorityCostFor, PRIORITY_STEP_SONGS } from "./pricing.ts";

test("öncelikli ücret: her 3 bekleyen normal şarkıda 1 jeton artar", () => {
  assert.equal(priorityCostFor(2, 0), 2);
  assert.equal(priorityCostFor(2, 2), 2);
  assert.equal(priorityCostFor(2, 3), 3);
  assert.equal(priorityCostFor(2, 5), 3);
  assert.equal(priorityCostFor(2, 6), 4);
  assert.equal(priorityCostFor(5, 30), 15);
});

test("öncelikli ücret: negatif sayım tabanın altına indirmez", () => {
  assert.equal(priorityCostFor(2, -4), 2);
});

test("sayım: yalnızca normal (öncelikli olmayan) satırlar", () => {
  assert.equal(normalQueuedCount([]), 0);
  assert.equal(
    normalQueuedCount([{ priority: false }, { priority: true }, { priority: false }, { priority: true }]),
    2,
  );
});

test("SQL ikizi: priority_cost_now'un son tanımı aynı adımı kullanıyor", () => {
  const dir = join(import.meta.dirname, "..", "supabase", "migrations");
  // Fonksiyonu en son yeniden tanımlayan migration geçerli olandır
  const latest = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .filter((sql) => /create\s+or\s+replace\s+function\s+public\.priority_cost_now\b/i.test(sql))
    .at(-1);
  assert.ok(latest, "priority_cost_now tanımı bulunamadı");

  const body = latest.slice(latest.search(/function\s+public\.priority_cost_now\b/i));
  const def = body.slice(0, body.indexOf("$$;"));
  const step = def.match(/count\(\*\)\s*\/\s*(\d+)/);
  assert.ok(step, "SQL formülünde count(*) / N bulunamadı");
  assert.equal(Number(step[1]), PRIORITY_STEP_SONGS);
  // Sayıma giren satırlar TS tarafındaki tanımla aynı olmalı
  assert.match(def, /status\s*=\s*'queued'/);
  assert.match(def, /user_id\s+is\s+not\s+null/);
  assert.match(def, /not\s+q\.priority/);
});
