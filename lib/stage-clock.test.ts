// Erken ilerletme kapısının testi: kuyruk, şarkılar çalmadan erimemeli — ama
// kapı da müziği susturmamalı. Senaryolar gerçek kayıtlardan alınmıştır
// (17 Ağu 2026, The Mezzanine Bar).
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldKeepStage, stageElapsedMs, type StageClock } from "./stage-clock.ts";

const NOW = Date.parse("2026-08-17T17:20:00.000Z");
const SONG = "song-1";
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

// Sahnede 4 dakikalık şarkı, `playedMs` kadar çalmış; oynatıcı sesini çıkarmıyor
function stage(playedMs: number, np: StageClock["np"] = null): StageClock {
  return {
    now: NOW,
    durationMs: 240_000,
    queueStartedAt: iso(playedMs),
    stageSongId: SONG,
    np,
  };
}

test("şarkının başındayken ilerletme reddedilir — kuyruk erimesinin ta kendisi", () => {
  assert.equal(shouldKeepStage(stage(1_000)), true);
  assert.equal(shouldKeepStage(stage(64_000)), true);
});

test("şarkı bitmeye yakınken ilerletme geçer", () => {
  assert.equal(shouldKeepStage(stage(239_000)), false);
});

test("çapraz geçişin erken ilerletmesi meşrudur (12 sn kala)", () => {
  assert.equal(shouldKeepStage(stage(228_000)), false);
});

test("tolerans sınırının hemen dışı reddedilir, içi geçer", () => {
  assert.equal(shouldKeepStage(stage(240_000 - 20_001)), true);
  assert.equal(shouldKeepStage(stage(240_000 - 20_000)), false);
});

test("SARMA: sona sarılan şarkı reddedilmez (17:23:52 kaydı)", () => {
  // Şarkı 30 sn önce başladı ama panelden sonuna sarıldı: oynatıcı 3:59'da
  const seeked = stage(30_000, {
    songId: SONG,
    startedAt: iso(239_000), // heartbeat çapayı now - progress ile kaydırdı
    progressMs: 239_000,
    isPlaying: true,
  });
  assert.equal(stageElapsedMs(seeked), 239_000);
  assert.equal(shouldKeepStage(seeked), false);
});

test("GERİ sarma kapıyı sıkmaz: kuyruk çapası geçerli kalır", () => {
  // 3:59'daki şarkı başa sarıldı — kapı yine de ilerletmeye izin verir
  const rewound = stage(239_000, {
    songId: SONG,
    startedAt: iso(2_000),
    progressMs: 2_000,
    isPlaying: true,
  });
  assert.equal(shouldKeepStage(rewound), false);
});

test("duraklatılmış şarkıda konum progress_ms'ten okunur", () => {
  const paused = stage(20_000, {
    songId: SONG,
    startedAt: iso(230_000),
    progressMs: 235_000,
    isPlaying: false,
  });
  assert.equal(stageElapsedMs(paused), 235_000);
  assert.equal(shouldKeepStage(paused), false);
});

test("now_playing BAŞKA şarkıyı gösteriyorsa yok sayılır", () => {
  // Şarkı az önce değişti: oradaki konum bir öncekine ait, kapıyı açmamalı
  const stale = stage(1_000, {
    songId: "song-0",
    startedAt: iso(600_000),
    progressMs: 600_000,
    isPlaying: true,
  });
  assert.equal(stageElapsedMs(stale), 1_000);
  assert.equal(shouldKeepStage(stale), true);
});

test("süre bilinmiyorsa kapı açılır (fail-open) — sessizlik riski alınmaz", () => {
  assert.equal(shouldKeepStage({ ...stage(1_000), durationMs: null }), false);
  assert.equal(shouldKeepStage({ ...stage(1_000), durationMs: 0 }), false);
});

test("çapa okunamıyorsa kapı açılır", () => {
  assert.equal(shouldKeepStage({ ...stage(1_000), queueStartedAt: null }), false);
  assert.equal(shouldKeepStage({ ...stage(1_000), queueStartedAt: "bozuk tarih" }), false);
});

test("gelecek tarihli çapa yok sayılır (saat kayması)", () => {
  const skewed: StageClock = { ...stage(1_000), queueStartedAt: iso(-60_000) };
  assert.equal(stageElapsedMs(skewed), null);
  assert.equal(shouldKeepStage(skewed), false);
});
