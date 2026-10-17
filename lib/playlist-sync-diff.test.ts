// "Şimdi güncelle" hiçbir şeyi silmez; eksik okuma "çıkarılmış" sayılmaz.
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { diffSource, nextSnapshot } from "./playlist-sync-diff.ts";

const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `v${from + i}`);

test("500'ü aşan liste: okuma tavanda kesildi → hiçbir şarkı 'çıkarılmış' sayılmaz", () => {
  const snapshot = ids(620);
  const diff = diffSource({ snapshot, videoIds: ids(500), complete: false, itemCount: 620 });
  assert.equal(diff.reliable, false);
  assert.deepEqual(diff.goneIds, [], "eskiden v500..v619 silinirdi");
  // Snapshot'tan da bir şey düşmez
  const next = nextSnapshot({ snapshot, videoIds: ids(500), reliable: false, stillMemberGoneIds: [] });
  assert.equal(next.length, 620);
});

test("YouTube şarkı sayısı varken boş liste döndürdü → güvenilmez, silme raporu yok", () => {
  const diff = diffSource({ snapshot: ids(18), videoIds: [], complete: true, itemCount: 18 });
  assert.equal(diff.reliable, false);
  assert.deepEqual(diff.goneIds, []);
});

test("eksiksiz okumada çıkarılan şarkı raporlanır ama snapshot'ta tutulur (tekrar eklenmez, yeniden sorulur)", () => {
  const snapshot = ["a", "b", "c"];
  const diff = diffSource({ snapshot, videoIds: ["a", "c", "d"], complete: true, itemCount: 3 });
  assert.equal(diff.reliable, true);
  assert.deepEqual(diff.goneIds, ["b"]);
  assert.deepEqual(diff.newIds, ["d"]);
  const next = nextSnapshot({ snapshot, videoIds: ["a", "c", "d"], reliable: true, stillMemberGoneIds: ["b"] });
  assert.deepEqual(next, ["a", "c", "d", "b"]);
});

test("mekan kaldırdıktan sonra çıkarılmış şarkı snapshot'tan düşer", () => {
  const next = nextSnapshot({ snapshot: ["a", "b"], videoIds: ["a"], reliable: true, stillMemberGoneIds: [] });
  assert.deepEqual(next, ["a"]);
});
