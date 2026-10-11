// Kendi alan adı üzerinden Google OAuth testi (lib/google-oauth.ts).
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

const { idTokenClaims, readGoogleFlow, redirectPath, startGoogleFlow } = await import("./google-oauth.ts");

const config = { clientId: "cid", clientSecret: "secret", origin: "https://playmyjam.com.tr" };

function decode(cookie: string) {
  return JSON.parse(Buffer.from(cookie, "base64url").toString("utf8"));
}

test("müşteri akışı kendi alan adımıza döner, PKCE S256 taşır", () => {
  const { url, cookie } = startGoogleFlow(config, "customer", { link: true });
  const u = new URL(url);
  const state = decode(cookie);
  assert.equal(u.searchParams.get("redirect_uri"), "https://playmyjam.com.tr/auth/callback");
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.equal(u.searchParams.get("state"), state.s);
  assert.equal(
    u.searchParams.get("code_challenge"),
    createHash("sha256").update(state.v).digest("base64url")
  );
  assert.equal(state.l, 1);
  // gizli anahtar asla tarayıcıya giden adreste olmamalı
  assert.ok(!url.includes("secret"));
});

test("mobil ve admin akışlarının dönüş adresleri", () => {
  assert.equal(redirectPath("customer", true), "/auth/native-callback");
  assert.equal(redirectPath("admin-link", false), "/api/admin/google/callback");
  const yt = new URL(startGoogleFlow(config, "youtube").url);
  assert.equal(yt.searchParams.get("redirect_uri"), "https://playmyjam.com.tr/api/admin/youtube/callback");
  assert.equal(yt.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube.readonly");
  assert.equal(yt.searchParams.get("prompt"), "consent");
  // link yalnız müşteri akışında anlamlı
  assert.equal(decode(startGoogleFlow(config, "admin-link", { link: true }).cookie).l, undefined);
});

test("state ve akış türü uyuşmazsa çerez reddedilir", () => {
  const { cookie } = startGoogleFlow(config, "customer");
  const { s } = decode(cookie);
  assert.equal(readGoogleFlow(cookie, s, "customer")?.s, s);
  assert.equal(readGoogleFlow(cookie, `${s}x`, "customer"), null);
  assert.equal(readGoogleFlow(cookie, s, "youtube"), null);
  assert.equal(readGoogleFlow(undefined, s, "customer"), null);
  assert.equal(readGoogleFlow("bozuk!!", s, "customer"), null);
});

test("kimlik jetonu içeriği", () => {
  const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
  assert.deepEqual(idTokenClaims(jwt({ sub: "123", email: " A@B.com ", email_verified: true })), {
    sub: "123",
    email: "a@b.com",
    emailVerified: true,
  });
  assert.equal(idTokenClaims(jwt({ email: "a@b.com" })), null);
  assert.equal(idTokenClaims(undefined), null);
  assert.equal(idTokenClaims("bozuk"), null);
});
