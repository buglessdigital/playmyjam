import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE, cookieOptions, signSession } from "@/lib/session";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { likePattern, pickExact } from "@/lib/admin-username";

// Kullanıcı adının var olup olmadığı dışarıya sızmasın: hem mesaj tek tip, hem de
// kullanıcı bulunamadığında sahte bir hash'e karşı bcrypt çalıştırılır — aksi halde
// yanıt süresi farkı hangi adminlerin var olduğunu ele verir.
const DUMMY_HASH = "$2b$10$WJhymeiUfnwto2l2dsiI1eJJq9FfXpbIVPS4/TWg5/7G6TDhrKuFu";
const INVALID_CREDENTIALS = "Kullanıcı adı veya şifre hatalı";

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 20;
const USERNAME_LIMIT = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  // İki eksen: tek IP'den toplu deneme ve tek hesaba yayılmış deneme
  const ip = clientIp(req);
  const [ipLimit, userLimit] = await Promise.all([
    consumeRateLimit(`admin-login:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS),
    consumeRateLimit(`admin-login:user:${username.toLocaleLowerCase("tr")}`, USERNAME_LIMIT, WINDOW_SECONDS),
  ]);
  const limited = !ipLimit.allowed ? ipLimit : !userLimit.allowed ? userLimit : null;
  if (limited) {
    return tooManyRequests(
      limited.retryAfter,
      "Çok fazla başarısız deneme. Lütfen bir süre sonra tekrar deneyin."
    );
  }

  // Büyük/küçük harf farkı giriş engellemesin — kullanıcı adı elle yazılıyor
  const pattern = likePattern(username);
  const { data: rows } = pattern
    ? await supabaseAdmin
        .from("venue_admins")
        .select("id, username, password_hash, venue_id, venues(id, slug, name, tagline, logo_url)")
        .ilike("username", pattern)
        .limit(2)
    : { data: null };
  const admin = pickExact(rows, username);

  const valid = await bcrypt.compare(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !valid) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const venue = Array.isArray(admin.venues) ? admin.venues[0] : admin.venues;
  if (!venue) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  // Ayrı sorgu: sütun henüz yoksa (0021 uygulanmadan) ana select'i düşürmesin,
  // sürüm 1 varsayılır ve giriş çalışmaya devam eder
  const { data: versionRow } = await supabaseAdmin
    .from("venue_admins")
    .select("session_version")
    .eq("id", admin.id)
    .maybeSingle();

  // Süre kayan: her panel isteği ve player heartbeat'i çerezi tazeler
  const maxAge = ADMIN_SESSION_MAX_AGE;
  const token = signSession({
    kind: "admin",
    admin_id: admin.id,
    venue_id: admin.venue_id,
    venue_slug: venue.slug,
    exp: Math.floor(Date.now() / 1000) + maxAge,
    sv: Number(versionRow?.session_version ?? 1),
  });

  const res = NextResponse.json({ ok: true, venue });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}
