import { test } from "node:test";
import assert from "node:assert/strict";
import { rankDiscover, relevance } from "./discover-rank.ts";

const s = (title: string, artist: string, inPool = true) => ({ title, artist, inPool });

test("kanal adının parçası şarkı adındaki tam kelimenin altında kalır", () => {
  assert.ok(relevance("bang", s("Bang", "Anitta")) > relevance("bang", s("Yaari : Nikk", "BANG Music")));
});

test("kelimenin içinde geçen eşleşme + dans provası atılır", () => {
  const pool = [
    s("[CHOREOGRAPHY] BTS 'Butter' Dance Practice", "BANGTANTV"),
    s("Bang Bang", "Jessie J"),
  ];
  const ext = [s("Bang!", "AJR", false)];
  const out = rankDiscover("bang", pool, ext).map((x) => x.artist);
  assert.deepEqual(out, ["Jessie J", "AJR"]);
});

test("aynı kademede havuz dış kaynağın önünde", () => {
  const out = rankDiscover("gidiyorum", [s("Gidiyorum", "Sezen Aksu")], [s("Gidiyorum", "Başkası", false)]);
  assert.equal(out[0].artist, "Sezen Aksu");
});

test("dış kaynaktaki tam eşleşme havuzdaki zayıf eşleşmenin önüne geçer", () => {
  const out = rankDiscover("bang", [s("Punjabi Songs 2020", "Bang Music")], [s("Bang!", "AJR", false)]);
  assert.equal(out[0].artist, "AJR");
});

test("sanatçı adı yazılınca o sanatçı en üstte", () => {
  assert.equal(relevance("manga", s("Bir Kadın Çizeceksin", "maNga")), 4);
  assert.ok(relevance("tarkan kuzu kuzu", s("Kuzu Kuzu", "Tarkan")) >= 3);
});

test("yazılmakta olan son kelime ön ek olarak tutar", () => {
  assert.equal(relevance("bangi", s("Bangır Bangır", "Gülşen")), 1);
  assert.equal(relevance("sezen aks", s("Gidiyorum", "Sezen Aksu")), 1);
});

test("dans provası arayan bulur", () => {
  assert.ok(relevance("butter dance practice", s("BTS 'Butter' Dance Practice", "BANGTANTV")) >= 3);
});
