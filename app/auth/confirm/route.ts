import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { setVenueAuthCookie } from "@/lib/venue-auth-cookie";

// E-posta onay/kurtarma linki buraya gelir. İki şablon biçimini de karşılar:
// token_hash (özelleştirilmiş şablon) → verifyOtp, ?code= (varsayılan
// {{ .ConfirmationURL }}) → PKCE takası. Her ikisi de e-postayı onaylayıp
// o cihazda oturum açar.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = (searchParams.get("type") as EmailOtpType) || "signup";
  const next = searchParams.get("next") || "";

  // Supabase doğrulama ucu süresi dolmuş linkte hata parametresiyle döner
  if (searchParams.get("error") || searchParams.get("error_code")) {
    return NextResponse.redirect(new URL("/?auth_error=confirm_failed", origin));
  }
  if (!tokenHash && !code) {
    return NextResponse.redirect(new URL("/?auth_error=confirm_invalid", origin));
  }

  // Open-redirect koruması: next'ten yalnızca path+query kullanılır, hedef her
  // zaman bu origin'de kurulur. Mutlak URL'in origin'i tutmasa da (ör. Site URL
  // hâlâ eski domaini gösteriyorsa) yol korunur — kullanıcı köke düşmesin.
  let nextPath = "/";
  if (next.startsWith("/") && !next.startsWith("//")) {
    nextPath = next;
  } else if (next) {
    try {
      const parsed = new URL(next);
      nextPath = parsed.pathname + parsed.search;
    } catch {
      // geçersiz next → kök sayfaya düş
    }
  }
  const venueId = nextPath.match(/^\/venue\/([^/]+)/)?.[1];

  let response = NextResponse.redirect(new URL(nextPath, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : await supabase.auth.exchangeCodeForSession(code!);

  // E-posta değişikliğinde ("Secure email change" açıkken) iki adrese de link
  // gider ve ilki doğrulandığında henüz oturum açılmaz — doğrulanmış kullanıcı
  // varsa bunu başarısızlık sayma.
  const user = data?.session?.user ?? data?.user ?? null;
  if (error || !user) {
    // Süresi dolmuş/kullanılmış link — login sayfasında anlaşılır mesaj göster
    const target = venueId ? `/venue/${venueId}?auth_error=confirm_failed` : "/?auth_error=confirm_failed";
    return NextResponse.redirect(new URL(target, origin));
  }

  if (venueId && data.session) {
    setVenueAuthCookie(response, venueId, user.id);
  }
  return response;
}
