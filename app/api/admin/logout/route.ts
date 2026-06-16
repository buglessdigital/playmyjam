import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, cookieOptions } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", cookieOptions(0));
  return res;
}
