import { NextRequest, NextResponse } from "next/server";
import { SUPER_SESSION_COOKIE, cookieOptions, safeStringEqual, signSession } from "@/lib/session";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Tek bir paylaşılan şifre olduğu için admin girişinden daha dar tutuldu
const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const expected = process.env.SUPER_ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik" }, { status: 500 });
  }

  const { allowed, retryAfter } = await consumeRateLimit(
    `super-login:ip:${clientIp(req)}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!allowed) {
    return tooManyRequests(retryAfter, "Çok fazla başarısız deneme. Lütfen bir süre sonra tekrar deneyin.");
  }

  if (!password || !safeStringEqual(password, expected)) {
    return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
  }

  const maxAge = 60 * 60 * 12; // 12 saat
  const token = signSession({ kind: "super", exp: Math.floor(Date.now() / 1000) + maxAge });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SUPER_SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}
