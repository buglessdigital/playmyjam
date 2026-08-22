// Saf YouTube çözümleyicilerinin testi. parseVideoId, admin'in onay ekranına
// yapıştırdığı bağlantıyı çözen fonksiyondur — yanlış ayrıştırma doğrudan
// "yanlış şarkı çaldı" demek olduğu için biçimlerin hepsi burada tutuluyor.
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseISODuration, parseVideoId, parseVideoTitle } from "./youtube-parse.ts";

test("parseVideoId: yapıştırılan her yaygın biçim", () => {
  const id = "dQw4w9WgXcQ";
  assert.equal(parseVideoId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(parseVideoId(`https://www.youtube.com/watch?v=${id}&list=PL123&index=2`), id);
  assert.equal(parseVideoId(`https://youtu.be/${id}`), id);
  assert.equal(parseVideoId(`https://youtu.be/${id}?t=42`), id);
  assert.equal(parseVideoId(`https://m.youtube.com/watch?v=${id}`), id);
  assert.equal(parseVideoId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(parseVideoId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(parseVideoId(`  https://www.youtube.com/watch?v=${id}  `), id);
  assert.equal(parseVideoId(id), id);
});

test("parseVideoId: bağlantı olmayan metin reddedilir", () => {
  assert.equal(parseVideoId(""), null);
  assert.equal(parseVideoId("Tarkan Kuzu Kuzu"), null);
  assert.equal(parseVideoId("https://open.spotify.com/track/abc"), null);
  // Playlist bağlantısında video yok — yanlışlıkla liste kimliğini almamalı
  assert.equal(parseVideoId("https://www.youtube.com/playlist?list=PL4fGSI1pDJn6"), null);
});

test("parseVideoTitle: gürültü temizliği ve sanatçı çıkarımı", () => {
  assert.deepEqual(parseVideoTitle("TARKAN - Kuzu Kuzu (Official Video)", "Tarkan"), {
    title: "Kuzu Kuzu",
    artist: "TARKAN",
  });
  // "- Topic" kanalları YouTube'un resmi ses kanalları: sanatçı kanal adıdır
  assert.deepEqual(parseVideoTitle("Şınanay", "Sezen Aksu - Topic"), {
    title: "Şınanay",
    artist: "Sezen Aksu",
  });
});

test("parseISODuration", () => {
  assert.equal(parseISODuration("PT3M45S"), 225_000);
  assert.equal(parseISODuration("PT1H2M3S"), 3_723_000);
  assert.equal(parseISODuration("bozuk"), 0);
});
