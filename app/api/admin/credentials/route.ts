import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession, revokeAdminSessions } from "@/lib/admin-session";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  cookieOptions,
  signSession,
} from "@/lib/session";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Mekan admini kendi giriş bilgilerini buradan değiştirir. Super-admin paneli
// aynı işi yapabiliyor (app/api/super-admin/venues/[venueId]) — fark: burada
// mevcut şifre doğrulanır, çünkü açık kalmış bir panel sekmesi hesabı ele
// geçirmeye yetmemeli.

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;
const MIN_PASSWORD = 8;

const WINDOW_SECONDS = 15 * 60;
const ATTEMPT_LIMIT = 10;

export async function GET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("venue_admins")
    .select("username, google_email, google_linked_at")
    .eq("id", session.admin_id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
  }
  return NextResponse.json({
    username: data.username,
    googleEmail: data.google_email ?? null,
    googleLinkedAt: data.google_linked_at ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newUsername = typeof body?.newUsername === "string" ? body.newUsername.trim() : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Mevcut şifrenizi girin" }, { status: 400 });
  }
  if (!newUsername && !newPassword) {
    return NextResponse.json({ error: "Değiştirecek bir bilgi girin" }, { status: 400 });
  }
  if (newUsername && !USERNAME_RE.test(newUsername)) {
    return NextResponse.json(
      { error: "Kullanıcı adı 3-40 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir" },
      { status: 400 }
    );
  }
  if (newPassword && newPassword.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Şifre en az ${MIN_PASSWORD} karakter olmalı` }, { status: 400 });
  }

  // Mevcut şifre denemesi de kaba kuvvete açık: hesap ve IP bazlı sayaç
  const ip = clientIp(req);
  const [ipLimit, adminLimit] = await Promise.all([
    consumeRateLimit(`admin-credentials:ip:${ip}`, ATTEMPT_LIMIT * 2, WINDOW_SECONDS),
    consumeRateLimit(`admin-credentials:admin:${session.admin_id}`, ATTEMPT_LIMIT, WINDOW_SECONDS),
  ]);
  const limited = !ipLimit.allowed ? ipLimit : !adminLimit.allowed ? adminLimit : null;
  if (limited) {
    return tooManyRequests(
      limited.retryAfter,
      "Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin."
    );
  }

  const { data: admin } = await supabaseAdmin
    .from("venue_admins")
    .select("id, username, password_hash")
    .eq("id", session.admin_id)
    .maybeSingle();

  if (!admin) {
    return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, admin.password_hash ?? "");
  if (!valid) {
    return NextResponse.json({ error: "Mevcut şifre hatalı" }, { status: 401 });
  }

  const update: Record<string, string> = {};

  if (newUsername && newUsername !== admin.username) {
    const { data: taken } = await supabaseAdmin
      .from("venue_admins")
      .select("id")
      .eq("username", newUsername)
      .maybeSingle();
    if (taken && taken.id !== admin.id) {
      return NextResponse.json({ error: "Bu kullanıcı adı kullanılıyor" }, { status: 409 });
    }
    update.username = newUsername;
  }

  if (newPassword) {
    update.password_hash = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, username: admin.username });
  }

  const { error } = await supabaseAdmin.from("venue_admins").update(update).eq("id", admin.id);
  if (error) {
    // Benzersizlik kısıtı yarışı: kontrol ile update arasında kapılmış olabilir
    const conflict = error.code === "23505";
    return NextResponse.json(
      { error: conflict ? "Bu kullanıcı adı kullanılıyor" : "Kaydedilemedi" },
      { status: conflict ? 409 : 500 }
    );
  }

  // Diğer cihazlardaki oturumlar düşsün; bu sekme ise taze sürümle devam etsin
  await revokeAdminSessions(session.venue_id);

  const { data: versionRow } = await supabaseAdmin
    .from("venue_admins")
    .select("session_version")
    .eq("id", admin.id)
    .maybeSingle();

  const res = NextResponse.json({ ok: true, username: update.username ?? admin.username });
  const token = signSession({
    kind: "admin",
    admin_id: session.admin_id,
    venue_id: session.venue_id,
    venue_slug: session.venue_slug,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE,
    sv: Number(versionRow?.session_version ?? 1),
  });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, cookieOptions(ADMIN_SESSION_MAX_AGE));
  return res;
}
