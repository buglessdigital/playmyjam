// npm test ile koşar: node --test lib/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dedupeSongs,
  matchesTokens,
  searchHaystack,
  searchTokens,
  tokenPattern,
} from "./search-match.ts";

const feel = searchHaystack("Feel (feat. Sena Sener)", "Mahmut Orhan");
const teni = searchHaystack("Teni Tenime", "Sena Sener");

test("kelimeler ayrı ayrı aranır: yarım yazılan son kelime sonuçları silmez", () => {
  assert.ok(matchesTokens(searchTokens("sena sener"), feel));
  assert.ok(matchesTokens(searchTokens("sena sener f"), feel));
  assert.ok(matchesTokens(searchTokens("sena sener fe"), feel));
  assert.ok(!matchesTokens(searchTokens("sena sener f"), teni));
});

test("sanatçı + şarkı karışık sırayla aranabilir", () => {
  assert.ok(matchesTokens(searchTokens("teni sena"), teni));
  assert.ok(matchesTokens(searchTokens("sener tenime"), teni));
  assert.ok(!matchesTokens(searchTokens("tarkan tenime"), teni));
});

test("Türkçe harfler ve büyük/küçük harf eşit sayılır", () => {
  const sezen = searchHaystack("İlk Aşkım", "Sezen Aksu");
  assert.ok(matchesTokens(searchTokens("ilk askim"), sezen));
  assert.ok(matchesTokens(searchTokens("İLK AŞKIM"), sezen));
  assert.ok(matchesTokens(searchTokens("şener"), teni));
});

test("boş sorgu her şeyi eşler, noktalama yok sayılır", () => {
  assert.deepEqual(searchTokens("   "), []);
  assert.ok(matchesTokens(searchTokens(""), teni));
  assert.ok(matchesTokens(searchTokens("feat. sena"), feel));
});

test("veritabanı deseni: harf sınıfları, özel karakter yok", () => {
  const pattern = tokenPattern("sener");
  assert.equal(pattern, "[sşSŞ][eéèêëEÉÈÊË][nñNÑ][eéèêëEÉÈÊË]r");
  assert.ok(!/[,()\\.*+?^$|{}]/.test(tokenPattern("abc123")));
  // Desen gerçek metinleri JS regex'inde de tutmalı (Postgres ~* ile aynı mantık)
  const re = new RegExp(pattern, "i");
  assert.ok(re.test("Sena Şener"));
  assert.ok(re.test("SENA SENER"));
});

test("aynı şarkının kopyaları teke iner, ilk (en çok izlenen) kalır", () => {
  const rows = [
    { id: "a", title: "Sevmemeliyiz", artist: "Sena Sener" },
    { id: "b", title: "Teni Tenime", artist: "Sena Sener" },
    { id: "c", title: "Sevmemeliyiz", artist: "Sena Şener" },
    { id: "d", title: "Sevmemeliyiz", artist: "Başka Sanatçı" },
  ];
  assert.deepEqual(
    dedupeSongs(rows).map((r) => r.id),
    ["a", "b", "d"]
  );
});
