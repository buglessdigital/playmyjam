// Google Maps linkinden koordinat çıkarma testi (0073, Mekanlar haritası).
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { coordsFromText, isAllowedMapsHost } from "./maps-link.ts";

test("iğne (!3d!4d) harita merkezinden (@) önce gelir", () => {
  const url =
    "https://www.google.com/maps/place/The+Mezzanine/@38.4300000,27.1400000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d38.4237123!4d27.1428456!16s";
  assert.deepEqual(coordsFromText(url), { lat: 38.4237123, lng: 27.1428456 });
});

test("yalnız @ varsa harita merkezi kullanılır", () => {
  assert.deepEqual(
    coordsFromText("https://www.google.com/maps/@41.0369,28.9850,15z"),
    { lat: 41.0369, lng: 28.985 }
  );
});

test("sorgu parametreleri ve elle yazılmış koordinat", () => {
  assert.deepEqual(coordsFromText("https://maps.google.com/?q=38.42,27.14"), { lat: 38.42, lng: 27.14 });
  assert.deepEqual(coordsFromText("https://www.google.com/maps/search/?api=1&query=38.42%2C27.14"), {
    lat: 38.42,
    lng: 27.14,
  });
  assert.deepEqual(coordsFromText("38.4237, 27.1428"), { lat: 38.4237, lng: 27.1428 });
  assert.deepEqual(coordsFromText(" -33.86,151.21 "), { lat: -33.86, lng: 151.21 });
});

test("koordinatsız ve geçersiz girdiler null döner", () => {
  assert.equal(coordsFromText("https://maps.app.goo.gl/AbCdEf123"), null);
  assert.equal(coordsFromText("https://maps.google.com/?cid=123456789"), null);
  assert.equal(coordsFromText("95.1, 27.1"), null);
  assert.equal(coordsFromText("0,0"), null);
  assert.equal(coordsFromText(""), null);
});

test("yalnız Google harita alan adlarına istek atılır", () => {
  assert.equal(isAllowedMapsHost("https://maps.app.goo.gl/AbC"), true);
  assert.equal(isAllowedMapsHost("https://www.google.com.tr/maps/place/x"), true);
  assert.equal(isAllowedMapsHost("https://consent.google.com/m?continue=x"), true);
  assert.equal(isAllowedMapsHost("http://maps.app.goo.gl/AbC"), false);
  assert.equal(isAllowedMapsHost("https://evil.com/google.com"), false);
  assert.equal(isAllowedMapsHost("https://google.com.evil.io/maps"), false);
  assert.equal(isAllowedMapsHost("https://169.254.169.254/latest"), false);
});
