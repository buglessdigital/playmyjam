import { NextRequest, NextResponse } from "next/server";
import { SUPER_SESSION_COOKIE, cookieOptions, safeStringEqual, signSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const expected = process.env.SUPER_ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik" }, { status: 500 });
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
