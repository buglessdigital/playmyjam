import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashResetToken } from "@/lib/admin-reset";
import { revokeAdminSessions } from "@/lib/admin-session";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Maildeki bağlantının indiği sayfa iki kez buraya gelir:
//   GET  → token geçerli mi (form gösterilsin mi)
//   POST → yeni şifreyi yaz, token'ı yak, tüm oturumları düşür
//
// Token tek kullanımlık: kullanıldığı anda used_at damgalanır.

const MIN_PASSWORD = 8;
const INVALID = "Bağlantı geçersiz veya süresi dolmuş. Giriş ekranından yeni bir bağlantı isteyin.";

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 20;

type ResetRow = {
  id: string;
  admin_id: string;
  expires_at: string;
  used_at: string | null;
};

async function findValidToken(token: string): Promise<ResetRow | null> {
  const { data } = await supabaseAdmin
    .from("admin_password_resets")
    .select("id, admin_id, expires_at, used_at")
    .eq("token_hash", hashResetToken(token))
    .maybeSingle();

  if (!data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data as ResetRow;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ valid: false, error: INVALID }, { status: 400 });

  const limit = await consumeRateLimit(`admin-reset-confirm:ip:${clientIp(req)}`, IP_LIMIT, WINDOW_SECONDS);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfter, "Çok fazla deneme. Lütfen bir süre sonra tekrar deneyin.");
  }

  const row = await findValidToken(token);
  if (!row) return NextResponse.json({ valid: false, error: INVALID }, { status: 400 });

  // Formda hangi hesap için şifre belirlendiği görünsün
  const { data: admin } = await supabaseAdmin
    .from("venue_admins")
    .select("username")
    .eq("id", row.admin_id)
    .maybeSingle();

  return NextResponse.json({ valid: true, username: admin?.username ?? "" });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token) return NextResponse.json({ error: INVALID }, { status: 400 });
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Şifre en az ${MIN_PASSWORD} karakter olmalı` }, { status: 400 });
  }

  const limit = await consumeRateLimit(`admin-reset-confirm:ip:${clientIp(req)}`, IP_LIMIT, WINDOW_SECONDS);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfter, "Çok fazla deneme. Lütfen bir süre sonra tekrar deneyin.");
  }

  const row = await findValidToken(token);
  if (!row) return NextResponse.json({ error: INVALID }, { status: 400 });

  // Önce token'ı yak: aynı bağlantıyla eşzamanlı ikinci bir istek geçmesin.
  // used_at filtresi koşulun hâlâ geçerli olmasını garanti eder.
  const { data: consumed } = await supabaseAdmin
    .from("admin_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (!consumed) return NextResponse.json({ error: INVALID }, { status: 400 });

  const { data: admin } = await supabaseAdmin
    .from("venue_admins")
    .select("id, venue_id, venues(slug)")
    .eq("id", row.admin_id)
    .maybeSingle();

  if (!admin) return NextResponse.json({ error: INVALID }, { status: 400 });

  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await supabaseAdmin
    .from("venue_admins")
    .update({ password_hash })
    .eq("id", admin.id);

  if (error) {
    console.error("[admin-reset] şifre yazılamadı:", error.message);
    return NextResponse.json({ error: "Şifre güncellenemedi, tekrar deneyin" }, { status: 500 });
  }

  // Şifre değişti: açık tüm oturumlar (panel ve mekan ekranı) düşsün
  await revokeAdminSessions(admin.venue_id);

  const venue = Array.isArray(admin.venues) ? admin.venues[0] : admin.venues;
  return NextResponse.json({ ok: true, venueId: venue?.slug ?? "" });
}
