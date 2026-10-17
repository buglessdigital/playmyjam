// Çalınamaz damgası yalnızca YouTube Data API'nin kararıyla vurulur.
//
// Çalıştırma: npm test
//
// Gerçek olay (17 Eki 2026, The Mezzanine Bar): önyükleme deck'i 20 dakikada
// 15 şarkıya "150 = gömmeye kapalı" dedi; Gibi Gibi 17:09–17:13 arası sonuna
// kadar çalmış, 17:34'te bu hatayla bütün mekanlardan silinmişti. YouTube'a
// sorulduğunda video gömülebilir çıkıyor → damga YOK.

import assert from "node:assert/strict";
import { test } from "node:test";

import { playabilityVerdict } from "./playability.ts";

test("17 Eki hatası: player 150 dese de YouTube gömülebilir diyorsa şarkı çalınabilir sayılır", () => {
  const gibiGibi = { status: { embeddable: true, privacyStatus: "public", uploadStatus: "processed" } };
  assert.equal(playabilityVerdict(gibiGibi), "playable");
});

test("gömmeye kapalı, gizli ya da kaldırılmış video çalınamaz", () => {
  assert.equal(playabilityVerdict({ status: { embeddable: false } }), "unplayable");
  assert.equal(playabilityVerdict({ status: { embeddable: true, privacyStatus: "private" } }), "unplayable");
  assert.equal(playabilityVerdict({ status: { embeddable: true, uploadStatus: "rejected" } }), "unplayable");
  // videos.list yanıtı geldi ama video içinde yok: silinmiş/gizlenmiş
  assert.equal(playabilityVerdict(null), "unplayable");
});

test("Türkiye'de engelli video çalınamaz, başka ülkede engelli olan çalınabilir", () => {
  assert.equal(
    playabilityVerdict({ status: { embeddable: true }, contentDetails: { regionRestriction: { blocked: ["TR"] } } }),
    "unplayable"
  );
  assert.equal(
    playabilityVerdict({ status: { embeddable: true }, contentDetails: { regionRestriction: { allowed: ["US", "GB"] } } }),
    "unplayable"
  );
  assert.equal(
    playabilityVerdict({ status: { embeddable: true }, contentDetails: { regionRestriction: { blocked: ["DE"] } } }),
    "playable"
  );
  assert.equal(
    playabilityVerdict({ status: { embeddable: true }, contentDetails: { regionRestriction: { allowed: ["TR"] } } }),
    "playable"
  );
});
