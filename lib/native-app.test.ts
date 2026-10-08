// Mobil uygulama derin bağlantı → WebView yolu testi (lib/native-app.ts).
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

// deepLinkToPath Universal Link'te kendi alan adını window.location'dan okur
(globalThis as { window?: unknown }).window = { location: { host: "playmyjam.com.tr" } };

const { deepLinkToPath } = await import("./native-app.ts");

test("Google dönüşü sorgusuyla /auth/callback'e çevrilir", () => {
  assert.equal(
    deepLinkToPath("playmyjam://auth/callback?code=abc&venueId=mezzanine"),
    "/auth/callback?code=abc&venueId=mezzanine"
  );
});

test("şema içi mekan yolu ve Universal Link", () => {
  assert.equal(deepLinkToPath("playmyjam://venue/mezzanine/browse"), "/venue/mezzanine/browse");
  assert.equal(deepLinkToPath("https://playmyjam.com.tr/venue/mezzanine"), "/venue/mezzanine");
});

test("başka alan adı ve bozuk adres reddedilir", () => {
  assert.equal(deepLinkToPath("https://kotu.example/venue/x"), null);
  assert.equal(deepLinkToPath("http://playmyjam.com.tr/venue/x"), null);
  assert.equal(deepLinkToPath("javascript:alert(1)"), null);
  assert.equal(deepLinkToPath("bozuk"), null);
});
