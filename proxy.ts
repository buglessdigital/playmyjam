import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAdminSession, getSuperSession } from "@/lib/session";

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
    const subPath = venueMatch[2] ?? "";

    // Ana sayfa (login) herkese açık
    if (!subPath || subPath === "/") {
      return NextResponse.next();
    }

    // Supabase session kontrolü
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

    const { data: { user } } = await supabase.auth.getUser();
    const venueId = venueMatch[1];

    if (!user) {
      return NextResponse.redirect(new URL(`/venue/${venueId}`, req.url));
    }

    // Bu venue'ya özel cookie'yi kontrol et — başka mekanların session'ı geçersiz
    const venueAuthCookie = req.cookies.get(`venue_auth_${venueId}`);
    if (!venueAuthCookie || venueAuthCookie.value !== user.id) {
      return NextResponse.redirect(new URL(`/venue/${venueId}`, req.url));
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/venue/:path*", "/super-admin/:path*"],
};
