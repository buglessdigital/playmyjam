import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  cookieOptions,
  getSuperSession,
  renewedAdminToken,
} from "@/lib/session";
import { adminGoogleLinkPending, getVerifiedAdminSession } from "@/lib/admin-session";
import {
  clearVenueMemberCookie,
  setVenueAuthCookie,
  venueAuthCookieName,
  venueMemberCookieName,
} from "@/lib/venue-auth-cookie";

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

// Hesap gerektirmeyen müşteri sayfaları — mekanı QR'dan açan biri giriş
// yapmadan kuyruğu, katalogu ve şarkı detaylarını görebilir.
const PUBLIC_VENUE_SEGMENTS = ["/queue", "/browse", "/song"];

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

    // PWA kurulum varlıkları oturum arkasında olamaz: tarayıcı manifest'i
    // çerezsiz (credentials: omit) ister, korunsaydı login'e düşer ve kurulum
    // hiç açılmazdı. İçerikleri zaten herkese açık (mekan adı + logosu).
    if (subPath === "/manifest.webmanifest" || subPath.startsWith("/app-icon/")) {
      return NextResponse.next();
    }

    // Session imzalı, iptal edilmemiş ve bu venue'ya ait olmalı.
    // Beklemedeki oturum da burada görülmeli: sahibini login'e değil, bağlama
    // ekranına göndereceğiz.
    const session = await getVerifiedAdminSession(req, { allowPendingGoogleLink: true });
    if (!session || session.venue_slug !== venueId) {
      return NextResponse.redirect(new URL(`/admin/${venueId}/login`, req.url));
    }

    // Yeni mekanlarda kurtarma hesabı bağlanmadan panelin hiçbir yeri (player
    // dahil) açılmaz; bağlandıktan sonra da bağlama ekranı geri gelmez.
    const linkPending = await adminGoogleLinkPending(session.admin_id);
    if (linkPending && subPath !== "/link-google") {
      return NextResponse.redirect(new URL(`/admin/${venueId}/link-google`, req.url));
    }
    if (!linkPending && subPath === "/link-google") {
      return NextResponse.redirect(new URL(`/admin/${venueId}`, req.url));
    }

    // Kayan süre: panel kullanıldıkça oturum uzar. Mekan ekranındaki player
    // sayfa gezinmesi yapmadığından asıl yenileme /api/player'dan gelir.
    const response = NextResponse.next();
    const renewed = renewedAdminToken(session);
    if (renewed) {
      response.cookies.set(ADMIN_SESSION_COOKIE, renewed, cookieOptions(ADMIN_SESSION_MAX_AGE));
    }
    return response;
  }

  // Müşteri route koruması. Mekanın vitrinini görmek için giriş gerekmez:
  // kuyruk, gözat ve şarkı detayı misafire açık. Hesap gerektiren sayfalar
  // (jeton, favori, geçmiş, istekler, profil, ayarlar) login'e yönlendirir.
  const venueMatch = pathname.match(/^\/venue\/([^/]+)(\/.*)?$/);
  if (venueMatch) {
    const venueId = venueMatch[1];
    const subPath = venueMatch[2] ?? "";

    // PWA kurulum varlıkları: tarayıcı manifest'i çerezsiz ister, oturum
    // kontrolünden geçirilemez (bkz. admin tarafındaki aynı muafiyet).
    if (subPath === "/manifest.webmanifest" || subPath.startsWith("/app-icon/")) {
      return NextResponse.next();
    }

    const isRoot = !subPath || subPath === "/";
    const isLoginPage = subPath === "/login" || subPath.startsWith("/login/");
    const isPublicPage = isLoginPage || PUBLIC_VENUE_SEGMENTS.some(
      (seg) => subPath === seg || subPath.startsWith(`${seg}/`)
    );

    const { userId, response } = await getVenueSession(req);

    // Bu venue'ya özel cookie'yi kontrol et — başka mekanların session'ı geçersiz.
    // Cross-venue otomatik yönlendirme yok: A mekanı kullanıcısı B'nin login'inde formu görür.
    const venueAuthCookie = req.cookies.get(venueAuthCookieName(venueId));
    const isMember = !!userId && venueAuthCookie?.value === userId;

    if (!isMember) {
      // Arayüz "hesap açık" sanmasın: erişim düştüyse ipucu çerezi de düşer,
      // yoksa misafir 401 yiyen butonlara basmaya devam ederdi
      if (req.cookies.get(venueMemberCookieName(venueId))) {
        clearVenueMemberCookie(response, venueId);
      }
      // E-posta onay/kurtarma linki herhangi bir sayfaya inebilir: varsayılan
      // {{ .ConfirmationURL }} şablonu emailRedirectTo'ya ?code= ekleyerek döner.
      // Yönlendirirsek token düşer ve kullanıcı sessizce sıkışır —
      // parametreleri koruyarak /auth/confirm'e taşı.
      const params = req.nextUrl.searchParams;
      if (params.get("token_hash") || params.get("code")) {
        const confirmUrl = new URL("/auth/confirm", req.url);
        params.forEach((value, key) => confirmUrl.searchParams.set(key, value));
        // Token'ı bir sonraki adrese taşımadan yalnızca hedef yolu geçir
        confirmUrl.searchParams.set("next", isRoot ? `/venue/${venueId}/queue` : pathname);
        return redirectWithCookies(confirmUrl, response);
      }
      if (isRoot) {
        return redirectWithCookies(new URL(`/venue/${venueId}/queue`, req.url), response);
      }
      if (isPublicPage) {
        return response;
      }
      const loginUrl = new URL(`/venue/${venueId}/login`, req.url);
      loginUrl.searchParams.set("next", pathname);
      return redirectWithCookies(loginUrl, response);
    }

    // Oturumu açık kullanıcıya login formunu tekrar gösterme
    if (isRoot || isLoginPage) {
      const next = isLoginPage ? req.nextUrl.searchParams.get("next") : null;
      const target = next && next.startsWith(`/venue/${venueId}/`) && !next.startsWith(`/venue/${venueId}/login`)
        ? next
        : `/venue/${venueId}/queue`;
      return redirectWithCookies(new URL(target, req.url), response);
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
