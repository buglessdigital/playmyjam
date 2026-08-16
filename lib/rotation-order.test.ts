// Kuyruğun değişmez kuralının testi: sıralı liste, bu turda en son çalınan
// şarkısından İLERİ okunur; başa ancak sıra listenin sonuna gelince döner.
//
// Çalıştırma: npm test
//
// Senaryolar gerçek olaydan alınmıştır (15 Ağu 2026, The Mezzanine Bar):
// 102 şarkılık "mezzanine 2024 summer" listesi #14'teyken kuyruk sıfırlandı ve
// liste #0'dan yeniden dizildi — sahnede listenin ortası çalarken sıradaki şarkı
// listenin ilk şarkısı oldu.

import assert from "node:assert/strict";
import { test } from "node:test";

import { orderFromResume, resumeIndexOf } from "./rotation-order.ts";

// #0..#101, gerçek listenin uzunluğu
const list = Array.from({ length: 102 }, (_, i) => `s${i}`);
const consumedUpTo = (n: number) => new Set(list.slice(0, n + 1));
// Çalma geçmişi yeniden eskiye
const playedUpTo = (n: number) => list.slice(0, n + 1).reverse();

test("15 Ağu hatası: tur ortasında kuyruk sıfırlanınca liste baştan başlamaz", () => {
  // Sahnede #14 çalıyor, kuyruk yeni silinmiş: defterde yalnızca fiilen çalmış
  // şarkılar kaldı. Sıra listenin DEVAMINDAN kurulmalı.
  const order = orderFromResume(list, playedUpTo(14), consumedUpTo(14));

  assert.equal(order[0], "s15", "sıradaki şarkı listenin devamı olmalı");
  assert.notEqual(order[0], "s0", "liste turun ortasında başa saramaz");
  // Turun başındaki şarkılar en sona sarkar
  assert.deepEqual(order.slice(-15), list.slice(0, 15));
  assert.equal(order.length, list.length, "hiçbir şarkı kaybolmaz");
  assert.equal(new Set(order).size, list.length, "hiçbir şarkı tekrarlanmaz");
});

test("defter tamamen boşalsa bile sıra çalma geçmişinden kurulur", () => {
  // En kötü hâl: tüketim defteri sıfırlanmış ama şarkı fiilen çalmış.
  // Çapa iki koşul birden aradığı için burada baştan başlamak DOĞRU davranıştır
  // (liste raydan düşüp geri alınmış olabilir) — asıl korunan, defter kısmen
  // eksildiğinde bile ileri gitmesi.
  assert.equal(resumeIndexOf(list, playedUpTo(14), new Set()), 0);
  assert.equal(resumeIndexOf(list, playedUpTo(14), consumedUpTo(14)), 15);
});

test("tur sonunda başa sarar", () => {
  const order = orderFromResume(list, playedUpTo(101), consumedUpTo(101));
  assert.equal(order[0], "s0", "son şarkı çalınca yeni tur baştan başlar");
});

test("hiç çalmamış liste baştan başlar", () => {
  assert.equal(orderFromResume(list, [], new Set())[0], "s0");
});

test("araya giren şarkı listedeki yeri değiştirmez", () => {
  // Müşteri #40'ı istedi ve çaldı; çalan liste #14'te. Geçmişin başında listeye
  // ait olmayan/başka sıradaki bir kayıt olsa da çapa en son ÇALAN liste
  // şarkısına düşer.
  const history = ["disarıdan-bir-sarki", ...playedUpTo(14)];
  assert.equal(orderFromResume(list, history, consumedUpTo(14))[0], "s15");
});

test("çapa şarkısı listeden çıkarılmışsa bir öncekine düşer", () => {
  const trimmed = list.filter((id) => id !== "s14");
  const order = orderFromResume(trimmed, playedUpTo(14), consumedUpTo(14));
  assert.equal(order[0], "s15", "silinen şarkı sırayı başa sardırmaz");
});

test("turun başındaki atlanmış şarkı kalanların önüne geçemez", () => {
  // #5 bir sebeple (çalınamaz, kilitli) atlanmış ve tüketilmemiş; liste #40'ta.
  const consumed = new Set(list.slice(0, 41).filter((id) => id !== "s5"));
  const order = orderFromResume(list, playedUpTo(40), consumed);
  const remaining = order.filter((id) => !consumed.has(id));

  assert.equal(remaining[0], "s41", "atlanan şarkı sırayı öne çekemez");
  assert.equal(remaining.at(-1), "s5", "ancak tur başa sarınca çalar");
});

test("tek şarkılık liste kendini tekrar eder", () => {
  assert.deepEqual(orderFromResume(["tek"], ["tek"], new Set(["tek"])), ["tek"]);
});

test("boş liste çökertmez", () => {
  assert.deepEqual(orderFromResume([], ["s1"], new Set(["s1"])), []);
});
