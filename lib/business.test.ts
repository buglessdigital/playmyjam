// Hakediş hesabı ve dönem yardımcılarının testi.
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { computePayout, dueDateFor, isOverdue, monthRange, parsePayoutSettings, shiftMonth } from "./business.ts";

test("hakediş: komisyon, KDV + banka + ek kesinti düşülmüş net ciro üzerinden", () => {
  // 50 jeton × 20 TL = 1000 TL (KDV dahil) → KDV 166,67 · banka %3 = 30 · ek %1 = 10
  const r = computePayout(50, 20, { vat_rate: 20, bank_fee_pct: 3, other_pct: 1 }, 40);
  assert.equal(r.gross, 1000);
  assert.equal(r.vat, 166.67);
  assert.equal(r.bankFee, 30);
  assert.equal(r.other, 10);
  assert.equal(r.net, 793.33);
  assert.equal(r.computed, 317.33);
});

test("hakediş: kullanım yoksa sıfır, net asla negatif değil", () => {
  assert.equal(computePayout(0, 20, { vat_rate: 20, bank_fee_pct: 3, other_pct: 0 }, 50).computed, 0);
  assert.equal(computePayout(10, 20, { vat_rate: 0, bank_fee_pct: 80, other_pct: 40 }, 50).net, 0);
});

test("ayarlar: bozuk değerler varsayılana düşer", () => {
  assert.deepEqual(parsePayoutSettings({ vat_rate: "x", bank_fee_pct: 150, other_pct: 2 }), {
    vat_rate: 20,
    bank_fee_pct: 0,
    other_pct: 2,
  });
  assert.deepEqual(parsePayoutSettings(null), { vat_rate: 20, bank_fee_pct: 0, other_pct: 0 });
});

test("dönem: yıl geçişi ve vade", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
  assert.equal(dueDateFor("2026-12", 15), "2027-01-15");
  assert.equal(dueDateFor("2026-09", 5), "2026-10-05");
});

test("gecikme: yalnızca ödenmemiş ve vadesi geçmiş kayıtlar", () => {
  assert.equal(isOverdue("approved", "2026-09-10", "2026-09-18"), true);
  assert.equal(isOverdue("draft", "2026-09-18", "2026-09-18"), false);
  assert.equal(isOverdue("paid", "2026-09-10", "2026-09-18"), false);
  assert.equal(isOverdue("cancelled", "2026-09-10", "2026-09-18"), false);
});
