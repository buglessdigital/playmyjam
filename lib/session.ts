import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export interface AdminSession {
  kind: "admin";
  admin_id: string;
  venue_id: string;
  venue_slug: string;
  exp: number; // unix saniye
  // Oturum iptali için satırdaki sürümle karşılaştırılır (bkz. lib/admin-session.ts).
  // Bu alandan önce basılmış çerezlerde yok — okurken 1 varsayılır.
  sv?: number;
}

export interface SuperSession {
  kind: "super";
  exp: number;
}

export const ADMIN_SESSION_COOKIE = "admin_session";
export const SUPER_SESSION_COOKIE = "sa_session";

export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 gün

// Kayan süre eşiği: kalan ömür bunun altına düşünce çerez tazelenir.
// Mekan ekranındaki player sayfası günlerce hiç gezinme yapmadan açık kaldığı
// için yenilemeyi yalnızca sayfa isteklerine bırakamayız — player'ın 15 sn'lik
// heartbeat'i de bu yoldan geçer (bkz. app/api/player/[venueId]/route.ts).
const ADMIN_RENEW_BELOW = 60 * 60 * 24 * 5;

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

// Oturum yenilenmeliyse yeni token, gerekmiyorsa null döner. Çağıran taraf
// token'ı yanıt çerezine basar; böylece düzenli kullanılan panel ve sürekli
// açık duran player asla 7. günde sessizce düşmez.
export function renewedAdminToken(session: AdminSession): string | null {
  const now = Math.floor(Date.now() / 1000);
  if (session.exp - now > ADMIN_RENEW_BELOW) return null;
  return signSession({ ...session, exp: now + ADMIN_SESSION_MAX_AGE });
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
