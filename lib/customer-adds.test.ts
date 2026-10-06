// Müşteri eklemelerini kapatma kuralının testi (0072).
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { CUSTOMER_ADDS_PAUSE_MAX_MS, isCustomerAddsPaused } from "./customer-adds.ts";

const now = Date.parse("2026-10-05T23:00:00Z");

test("kapatma damgası yoksa eklemeler açık", () => {
  assert.equal(isCustomerAddsPaused(null, now), false);
  assert.equal(isCustomerAddsPaused(undefined, now), false);
  assert.equal(isCustomerAddsPaused("bozuk", now), false);
});

test("kapatma 12 saat boyunca geçerli, sonra kendiliğinden düşer", () => {
  assert.equal(isCustomerAddsPaused(new Date(now - 60_000).toISOString(), now), true);
  assert.equal(isCustomerAddsPaused(new Date(now - CUSTOMER_ADDS_PAUSE_MAX_MS + 1).toISOString(), now), true);
  assert.equal(isCustomerAddsPaused(new Date(now - CUSTOMER_ADDS_PAUSE_MAX_MS).toISOString(), now), false);
});
