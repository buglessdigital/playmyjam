import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAdminSession, getSuperSession } from "@/lib/session";
import { setVenueAuthCookie, venueAuthCookieName } from "@/lib/venue-auth-cookie";

// getClaims: JWT imzasını yerelde doğrular (asimetrik anahtarla) — her istekte
// Auth sunucusuna gitmez. Token süresi dolmuşsa oturumu tazeleyip cookie'leri günceller.
async function getVenueSession(req: NextRequest): Promise<{ userId?: string; response: NextResponse }> {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  return { userId: claimsData?.claims.sub, response };
}

// Redirect response'una session cookie'lerini taşı: refresh token rotasyonu tek
// kullanımlık olduğundan, tazelenen cookie'ler redirect'te kaybolursa oturum düşer.
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Super-admin route koruması
  if (pathname.startsWith("/super-admin")) {
    if (pathname === "/super-admin/login") {
      return NextResponse.next();
    }
    if (!getSuperSession(req)) {
      return NextResponse.redirect(new URL("/super-admin/login", req.url));
    }
    return NextResponse.next();
  }

  // Admin route koruması
  const adminMatch = pathname.match(/^\/admin\/([^/]+)(\/.*)?$/);
  if (adminMatch) {
    const venueId = adminMatch[1];
    const subPath = adminMatch[2] ?? "";

    // Login sayfasına erişime izin ver
    if (subPath === "/login" || subPath.startsWith("/login")) {
      return NextResponse.next();
    }

    // Session imzalı ve bu venue'ya ait olmalı
    const session = getAdminSession(req);
    if (!session || session.venue_slug !== venueId) {
      return NextResponse.redirect(new URL(`/admin/${venueId}/login`, req.url));
    }

    return NextResponse.next();
  }

  // Müşteri route koruması — giriş sayfasının kendisi (/venue/[id]) açık, alt sayfalar korumalı
  const venueMatch = pathname.match(/^\/venue\/([^/]+)(\/.*)?$/);
  if (venueMatch) {
    const venueId = venueMatch[1];
    const subPath = venueMatch[2] ?? "";
    const isLoginPage = !subPath || subPath === "/";

    const { userId, response } = await getVenueSession(req);

    // Bu venue'ya özel cookie'yi kontrol et — başka mekanların session'ı geçersiz.
    // Cross-venue otomatik yönlendirme yok: A mekanı kullanıcısı B'nin login'inde formu görür.
    const venueAuthCookie = req.cookies.get(venueAuthCookieName(venueId));
    if (!userId || venueAuthCookie?.value !== userId) {
      if (isLoginPage) {
        return response;
      }
      return redirectWithCookies(new URL(`/venue/${venueId}`, req.url), response);
    }

    // Oturumu açık kullanıcıya login formunu tekrar gösterme
    if (isLoginPage) {
      return redirectWithCookies(new URL(`/venue/${venueId}/queue`, req.url), response);
    }

    // Kayan süre: her ziyarette 180 günlük taze maxAge — düzenli kullanılan cihaz açık kalır
    setVenueAuthCookie(response, venueId, userId);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/venue/:path*", "/super-admin/:path*"],
};
