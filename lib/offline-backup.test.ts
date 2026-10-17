// Kesintide müzik tek şarkıdan sonra susmaz; yedekten sırayla, tekrar etmeden çalar.
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { pickOfflineVideo } from "./offline-backup.ts";

const base = {
  preloaded: null,
  backup: ["s2", "s3", "s4", "s5", "s6"],
  current: "s1",
  fallbackFrom: null,
  played: [] as string[],
  unplayable: new Set<string>(),
};

test("kesinti başında tampondaki şarkı çalar", () => {
  assert.equal(pickOfflineVideo({ ...base, preloaded: "s2" }), "s2");
});

test("tampon tükenince yedekten sıradaki gelir (eskiden burada müzik susuyordu)", () => {
  // s1 kesintiden önce çalıyordu, s2 yedekten çaldı ve bitti, şu an s3 çalıyor
  const next = pickOfflineVideo({ ...base, current: "s3", fallbackFrom: "s1", played: ["s2"] });
  assert.equal(next, "s4");
});

test("çalınmış ya da çalınamaz şarkı tekrar seçilmez", () => {
  const next = pickOfflineVideo({
    ...base,
    current: "s3",
    fallbackFrom: "s1",
    played: ["s2"],
    unplayable: new Set(["s4"]),
  });
  assert.equal(next, "s5");
});

test("yedek bitince null (player sunucuyu beklemeye devam eder)", () => {
  const next = pickOfflineVideo({
    ...base,
    current: "s6",
    fallbackFrom: "s1",
    played: ["s2", "s3", "s4", "s5"],
  });
  assert.equal(next, null);
});
