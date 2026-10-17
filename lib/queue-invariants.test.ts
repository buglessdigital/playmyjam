// Sıra kuralı: otomatik dolum yalnızca ÇALAN listeden gelir.
//
// Çalıştırma: npm test
//
// Gerçek olay (17 Eki 2026, The Mezzanine Bar): "akşam üstü türkçe"den şarkı
// açıldı, liste devri kayboldu; şarkı bitince sıradaki otomatik satır artık
// çalmayan "Yeni mehmet music"tendi ve çaldı. Bu kural o satırı çalmadan yakalar.

import assert from "node:assert/strict";
import { test } from "node:test";

import { staleAutoRow } from "./queue-invariants.ts";

const AKSAM = "aksam-ustu-turkce";
const MEHMET = "yeni-mehmet-music";

test("17 Eki hatası: çalmayan listenin otomatik satırı bayattır", () => {
  assert.equal(staleAutoRow(MEHMET, [AKSAM]), true);
});

test("çalan listenin satırı geçerlidir", () => {
  assert.equal(staleAutoRow(AKSAM, [AKSAM]), false);
});

test("katalog yedeği (kaynaksız satır) her zaman geçerlidir", () => {
  assert.equal(staleAutoRow(null, [AKSAM]), false);
  assert.equal(staleAutoRow(null, []), false);
});

test("hiç çalan liste yokken kaynaklı otomatik satır bayattır", () => {
  assert.equal(staleAutoRow(MEHMET, []), true);
});
