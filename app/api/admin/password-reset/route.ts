import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { passwordResetEmail, sendMail } from "@/lib/mail";
import { RESET_TOKEN_TTL_MINUTES, hashResetToken } from "@/lib/admin-reset";
import { likePattern, pickExact } from "@/lib/admin-username";

// "Şifremi unuttum": kullanıcı adına bağlı Google adresine tek kullanımlık
// bağlantı yollar.
//
// Yanıt her durumda aynı: kullanıcı adının var olup olmadığı da, o hesaba
// Google bağlı olup olmadığı da dışarıya sızmasın.

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 10;
const USERNAME_LIMIT = 3;

const GENERIC_OK =
  "Hesabınıza bağlı Google adresi varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve spam klasörünü) kontrol edin.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const venueSlug = typeof body?.venueId === "string" ? body.venueId.trim() : "";

  if (!username) {
    return NextResponse.json({ error: "Kullanıcı adınızı girin" }, { status: 400 });
  }

  const ip = clientIp(req);
  const [ipLimit, userLimit] = await Promise.all([
    consumeRateLimit(`admin-reset:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS),
    consumeRateLimit(`admin-reset:user:${username.toLocaleLowerCase("tr")}`, USERNAME_LIMIT, WINDOW_SECONDS),
  ]);
  const limited = !ipLimit.allowed ? ipLimit : !userLimit.allowed ? userLimit : null;
  if (limited) {
    return tooManyRequests(
      limited.retryAfter,
      "Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin."
    );
  }

  // Kullanıcı adı elle yazılıyor: harf farkı ya da adın tam hatırlanmaması
  // sessizce "mail gitmedi"ye dönüşmesin diye arama hem büyük/küçük harf
  // duyarsız, hem de bağlı Google adresi kimlik olarak kabul ediliyor.
  const pattern = likePattern(username);
  const columns = "id, username, google_email, venue_id, venues(slug, name)";
  const { data: rows } = pattern
    ? await supabaseAdmin
        .from("venue_admins")
        .select(columns)
        .or(`username.ilike.${pattern},google_email.ilike.${pattern}`)
        .limit(2)
    : { data: null };
  const admin = pickExact(rows, username);

  const venue = Array.isArray(admin?.venues) ? admin?.venues[0] : admin?.venues;

  if (!admin?.google_email || !venue) {
    // Dışarıya hep aynı yanıt gidiyor; "mail neden gelmedi" sorusunun cevabı
    // yalnızca burada görünür
    console.warn(
      `[admin-reset] gönderilmedi (${!admin ? "hesap yok" : !venue ? "mekan yok" : "Google bağlı değil"})`
    );
    return NextResponse.json({ ok: true, message: GENERIC_OK });
  }

  // Yeni bağlantı istendiğinde eskiler yansın: aynı anda birden fazla geçerli
  // bağlantı dolaşmasın
  await supabaseAdmin
    .from("admin_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("admin_id", admin.id)
    .is("used_at", null);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000).toISOString();

  const { error: insertError } = await supabaseAdmin.from("admin_password_resets").insert({
    admin_id: admin.id,
    token_hash: hashResetToken(token),
    expires_at: expiresAt,
    ip,
  });

  if (insertError) {
    console.error("[admin-reset] token kaydedilemedi:", insertError.message);
    return NextResponse.json({ error: "Şu anda işlem yapılamıyor, tekrar deneyin" }, { status: 500 });
  }

  // Bağlantıdaki mekan, hesabın gerçek mekanı — istekteki slug'a güvenilmez
  const slug = venue.slug || venueSlug;
  const link = new URL(`/admin/${slug}/login/reset`, req.nextUrl.origin);
  link.searchParams.set("token", token);

  const message = passwordResetEmail(venue.name ?? "PlayMyJam", link.toString(), RESET_TOKEN_TTL_MINUTES);
  const sent = await sendMail({ ...message, to: admin.google_email });

  if (!sent.ok) {
    // Mail çıkmadıysa token'ı bırakma: kullanıcı tekrar denediğinde temiz başlasın
    await supabaseAdmin
      .from("admin_password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", hashResetToken(token));
    return NextResponse.json(
      { error: "Mail gönderilemedi. Lütfen daha sonra tekrar deneyin." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, message: GENERIC_OK });
}
