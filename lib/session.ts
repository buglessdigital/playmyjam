import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export interface AdminSession {
  kind: "admin";
  admin_id: string;
  venue_id: string;
  venue_slug: string;
  exp: number; // unix saniye
}

export interface SuperSession {
  kind: "super";
  exp: number;
}

export const ADMIN_SESSION_COOKIE = "admin_session";
export const SUPER_SESSION_COOKIE = "sa_session";

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env değişkeni eksik veya çok kısa (en az 32 karakter olmalı)");
  }
  return Buffer.from(secret, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(data: string): Buffer {
  return createHmac("sha256", getSecret()).update(data).digest();
}

export function signSession(payload: AdminSession | SuperSession): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${b64url(hmac(body))}`;
}

export function verifySession<T extends { exp: number }>(token: string | undefined | null): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  const expected = hmac(body);
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

type CookieSource = Pick<NextRequest, "cookies">;

export function getAdminSession(req: CookieSource): AdminSession | null {
  const session = verifySession<AdminSession>(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  return session?.kind === "admin" ? session : null;
}

export function getSuperSession(req: CookieSource): SuperSession | null {
  const session = verifySession<SuperSession>(req.cookies.get(SUPER_SESSION_COOKIE)?.value);
  return session?.kind === "super" ? session : null;
}

// Super-admin VEYA bu venue'nun admini erişebilir
export function requireVenueAccess(req: CookieSource, venueDbId: string): boolean {
  if (getSuperSession(req)) return true;
  const admin = getAdminSession(req);
  return admin !== null && admin.venue_id === venueDbId;
}

// Uzunluk farkını gizlemek için iki tarafı da hash'leyip sabit zamanlı karşılaştırır
export function safeStringEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}
