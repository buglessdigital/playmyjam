// Tür ailesi + pay hesabı testi (Mekanlar haritası).
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { genreFamily, genreShares } from "./genres.ts";

test("iTunes'un parçalı adları aynı ailede toplanır", () => {
  assert.equal(genreFamily("Dance"), "electronic");
  assert.equal(genreFamily("House"), "electronic");
  assert.equal(genreFamily("Electronic"), "electronic");
  assert.equal(genreFamily("Turkish Hip-Hop/Rap"), "hiphop");
  assert.equal(genreFamily("Arabesque"), "arabesk");
  assert.equal(genreFamily("HALK"), "folk");
  assert.equal(genreFamily("Türk Sanat Müziği"), "tsm");
  assert.equal(genreFamily("Polka"), "raw:Polka");
});

test("pay türü bilinen çalmalar içinde hesaplanır, aileler birleşir", () => {
  const { shares, coverage } = genreShares([
    { plays: 30, genre: "Dance" },
    { plays: 20, genre: "House" },
    { plays: 25, genre: "Jazz" },
    { plays: 25, genre: null },
  ]);
  assert.deepEqual(shares, [
    { key: "electronic", share: 50 / 75 },
    { key: "jazz", share: 25 / 75 },
  ]);
  assert.equal(coverage, 0.75);
});

test("hiç tür bilinmiyorsa boş döner", () => {
  assert.deepEqual(genreShares([{ plays: 5, genre: null }]), { shares: [], coverage: 0 });
  assert.deepEqual(genreShares([]), { shares: [], coverage: 0 });
});
