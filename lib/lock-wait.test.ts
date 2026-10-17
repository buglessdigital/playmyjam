// Panel komutları kaybolmaz ve son tıklama kazanır.
//
// Çalıştırma: npm test
//
// Gerçek olay (17 Eki 2026, The Mezzanine Bar): 18:48:11'de "Yeni mehmet music"
// çalarken 18:49:11'de "akşam üstü türkçe"den Mor Menekşe açıldı. O anda dolum
// kilidi doluydu; eski kod kilidi alamayan komutu ATIYORDU. Sahne değişti ama
// liste devredilmedi, şarkı bitince "Yeni mehmet music"ten Martılar çaldı.

import assert from "node:assert/strict";
import { test } from "node:test";

import { acquireOrWait, shouldApplyIntent } from "./lock-wait.ts";

// Sahte saat + sahte kilit: `heldUntil` anına kadar kilit başkasında
function fakeLock(heldUntil: number) {
  let clock = 0;
  let owner: string | null = null;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    tryAcquire: (who: string) => async () => {
      if (clock < heldUntil || (owner && owner !== who)) return "busy" as const;
      owner = who;
      return "acquired" as const;
    },
    release: () => {
      owner = null;
    },
  };
}

test("17 Eki hatası: dolum kilidi doluyken 'listeyi devral' DÜŞMEZ, bekleyip uygulanır", async () => {
  // Dolum 4 sn daha sürüyor
  const lock = fakeLock(4_000);
  const outcome = await acquireOrWait(lock.tryAcquire("akşam üstü"), {
    maxWaitMs: 65_000,
    stepMs: 150,
    now: lock.now,
    sleep: lock.sleep,
  });
  assert.equal(outcome, "acquired", "komut kilidi beklemeli, çekilmemeli");
  assert.ok(lock.now() >= 4_000, "kilit boşalmadan alınmamalı");
});

test("kilit hiç boşalmazsa süre dolunca 'timeout' (çağıran kilitsiz uygular ve alarm verir)", async () => {
  const lock = fakeLock(Number.POSITIVE_INFINITY);
  const outcome = await acquireOrWait(lock.tryAcquire("x"), {
    maxWaitMs: 8_000,
    stepMs: 150,
    now: lock.now,
    sleep: lock.sleep,
  });
  assert.equal(outcome, "timeout");
});

test("kilit arızası beklenmez: 'error' hemen döner (iş kilitsiz yapılır, müzik durmaz)", async () => {
  let calls = 0;
  const outcome = await acquireOrWait(
    async () => {
      calls++;
      return "error";
    },
    { maxWaitMs: 8_000, stepMs: 150, sleep: async () => {} }
  );
  assert.equal(outcome, "error");
  assert.equal(calls, 1);
});

test("art arda iki tıklama: kilidi önce kapan ESKİ komut olsa bile son tıklama kazanır", () => {
  // A tıklandı (damga A), sonra B tıklandı (damga B). Damga deposu en sonuncuyu tutar.
  const latest = "B";
  assert.equal(shouldApplyIntent(latest, "A"), false, "A'nın listesi B'nin üstüne yazılmamalı");
  assert.equal(shouldApplyIntent(latest, "B"), true);
});

test("damga okunamazsa komut yine uygulanır (komut kaybetmek sıra karışmasından kötü)", () => {
  assert.equal(shouldApplyIntent(undefined, "A"), true);
  assert.equal(shouldApplyIntent(null, "A"), true);
  assert.equal(shouldApplyIntent("B", undefined), true);
});
