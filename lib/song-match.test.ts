// Eşleştirme katmanının testi: ELEME (bu video o şarkı mı) ve SEÇME (aynı
// şarkının hangi sürümü) kararları ayrı ayrı doğrulanır.
//
// Çalıştırma: npm test
//
// Örnekler gerçek YouTube başlık kalıplarından alınmıştır — tohumlanan ortak
// havuzda aynı şarkının resmi kaydı, karaokesi ve hızlandırılmışı yan yana durur.

import assert from "node:assert/strict";
import { test } from "node:test";

import { leadArtist, matchScore, pickBestMatch, suggestionMatchesSong } from "./song-match.ts";

const req = (title: string, artist: string) => ({
  suggested_title: title,
  suggested_artist: artist,
});

test("gürültülü YouTube başlığı temiz talep metniyle eşleşir", () => {
  assert.ok(
    suggestionMatchesSong(req("Kuzu Kuzu", "Tarkan"), {
      title: "Kuzu Kuzu",
      artist: "Tarkan",
      channel_title: "Tarkan",
    })
  );
});

test("VEVO/kanal adı bitişik yazılsa da sanatçı tutar", () => {
  // Eski ölçüt kelime kümesi karşılaştırdığı için "tarkanvevo" ile "tarkan" kaçıyordu
  assert.ok(
    suggestionMatchesSong(req("Şımarık", "Tarkan"), {
      title: "Simarik",
      artist: "TarkanVEVO",
      channel_title: "TarkanVEVO",
    })
  );
});

test("düetin ikinci adı YouTube başlığında yoksa eşleşme kaçmaz", () => {
  // Apple/Deezer "A feat. B" verir, YouTube başlığı çoğu zaman yalnızca A'yı taşır
  assert.ok(
    suggestionMatchesSong(req("Aşk", "Sezen Aksu feat. Tarkan"), {
      title: "Ask",
      artist: "Sezen Aksu",
      channel_title: "Sezen Aksu - Topic",
    })
  );
});

test("başka şarkı elenir", () => {
  assert.equal(
    matchScore(req("Kuzu Kuzu", "Tarkan"), {
      title: "Şımarık",
      artist: "Tarkan",
      channel_title: "Tarkan",
    }),
    null
  );
});

test("doğru şarkı ama yanlış sanatçı elenir", () => {
  assert.equal(
    matchScore(req("Kuzu Kuzu", "Tarkan"), {
      title: "Kuzu Kuzu",
      artist: "Karaoke Türk",
      channel_title: "Karaoke Türk",
    }),
    null
  );
});

test("SEÇME: resmi ses kaydı karaoke ve hızlandırılmış sürümü geçer", () => {
  const havuz = [
    { title: "Kuzu Kuzu (Karaoke)", artist: "Tarkan", channel_title: "Tarkan", view_count: 900_000 },
    { title: "Kuzu Kuzu (Speed Up)", artist: "Tarkan", channel_title: "Tarkan", view_count: 5_000_000 },
    { title: "Kuzu Kuzu", artist: "Tarkan", channel_title: "Tarkan - Topic", view_count: 1_000_000 },
    { title: "Kuzu Kuzu (Live)", artist: "Tarkan", channel_title: "Tarkan", view_count: 2_000_000 },
  ];

  const best = pickBestMatch(req("Kuzu Kuzu", "Tarkan"), havuz);
  assert.equal(best?.channel_title, "Tarkan - Topic");
});

test("SEÇME: müşteri remix istediyse remix cezalandırılmaz", () => {
  const havuz = [
    { title: "Geceler", artist: "Model", channel_title: "Model - Topic", view_count: 3_000_000 },
    { title: "Geceler (Remix)", artist: "Model", channel_title: "Model", view_count: 100_000 },
  ];

  const best = pickBestMatch(req("Geceler Remix", "Model"), havuz);
  assert.equal(best?.title, "Geceler (Remix)");
});

test("SEÇME: saatlik karışım süresi yüzünden geriye düşer", () => {
  const havuz = [
    { title: "Şınanay", artist: "Sezen Aksu", channel_title: "Mix Kanal", view_count: 50_000_000, duration_ms: 3_600_000 },
    { title: "Şınanay", artist: "Sezen Aksu", channel_title: "Sezen Aksu - Topic", view_count: 400_000, duration_ms: 210_000 },
  ];

  const best = pickBestMatch(req("Şınanay", "Sezen Aksu"), havuz);
  assert.equal(best?.channel_title, "Sezen Aksu - Topic");
});

test("hiç aday yoksa null döner", () => {
  assert.equal(pickBestMatch(req("Kuzu Kuzu", "Tarkan"), []), null);
});

test("leadArtist ayırıcıları", () => {
  assert.equal(leadArtist("Tarkan feat. Sezen Aksu"), "Tarkan");
  assert.equal(leadArtist("Sezen Aksu & Tarkan"), "Sezen Aksu");
  assert.equal(leadArtist("Model, Duman"), "Model");
  assert.equal(leadArtist("Calvin Harris x Dua Lipa"), "Calvin Harris");
  assert.equal(leadArtist("Duman"), "Duman");
});
