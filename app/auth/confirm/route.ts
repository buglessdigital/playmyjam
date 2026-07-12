import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { setVenueAuthCookie } from "@/lib/venue-auth-cookie";

// E-posta onay linki buraya gelir (dashboard template'i token_hash ile bu route'u
// işaret eder). verifyOtp hem e-postayı onaylar hem o cihazda oturum açar.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") as EmailOtpType) || "signup";
  const next = searchParams.get("next") || "";

  if (!tokenHash) {
    return NextResponse.redirect(new URL("/?auth_error=confirm_invalid", origin));
  }

  // Open-redirect koruması: sadece same-origin, path-only next kabul et
  let nextPath = "/";
  if (next.startsWith("/") && !next.startsWith("//")) {
    nextPath = next;
  } else if (next) {
    try {
      const parsed = new URL(next);
      if (parsed.origin === origin) nextPath = parsed.pathname + parsed.search;
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

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.session) {
    // Süresi dolmuş/kullanılmış link — login sayfasında anlaşılır mesaj göster
    const target = venueId ? `/venue/${venueId}?auth_error=confirm_failed` : "/?auth_error=confirm_failed";
    return NextResponse.redirect(new URL(target, origin));
  }

  if (venueId) {
    setVenueAuthCookie(response, venueId, data.session.user.id);
  }
  return response;
}
