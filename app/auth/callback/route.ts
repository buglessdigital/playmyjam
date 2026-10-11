import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SignInWithIdTokenCredentials } from "@supabase/supabase-js";
import { setVenueAuthCookie } from "@/lib/venue-auth-cookie";
import { reportIssue } from "@/lib/ops-log";
import {
  GOOGLE_FLOW_COOKIE,
  exchangeGoogleCode,
  googleOAuthConfig,
  readGoogleFlow,
} from "@/lib/google-oauth";

// Misafir → mevcut hesap birleştirme bileti (0071); yalnız bu route okur
const MERGE_COOKIE = "pmj_guest_merge";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const venueId = searchParams.get("venueId") || req.cookies.get("pending_oauth_venue")?.value;

  if (!venueId) {
    return NextResponse.redirect(new URL("/?auth_error=missing_params", origin));
  }

  // Girişi tetikleyen sayfa (ör. jeton satın alma) — PKCE sorguyu ezerse çerezten okunur
  const rawNext =
    searchParams.get("next") ||
    decodeURIComponent(req.cookies.get("pending_oauth_next")?.value ?? "");
  const nextPath =
    rawNext.startsWith(`/venue/${venueId}/`) && !rawNext.startsWith(`/venue/${venueId}/login`)
      ? rawNext
      : `/venue/${venueId}/browse`;
  const loginUrl = `/venue/${venueId}/login`;

  // Tek-response deseni: Supabase'in yazdığı session cookie'leri doğrudan
  // dönen redirect response'una gitsin — aksi halde ilk denemede sb-* cookie'leri
  // tarayıcıya ulaşmaz ve proxy kullanıcıyı login'e geri atar.
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

  // Misafir Google'ı bağlamak istedi ama o Google hesabının zaten bir
  // PlayMyJam hesabı var. İstek hâlâ misafir oturumunu taşıyor: birleştirme
  // biletini ŞİMDİ kes, müşteri mevcut hesabıyla girince callback tüketsin.
  const identityExists = async () => {
    // Yanıt RPC'den ÖNCE kurulur: oturum tazelenirse yeni çerezler buna yazılsın.
    // Başlıklar taşınır: linkIdentity sırasında tazelenen oturum çerezleri
    // kaybolursa misafir eski refresh token'la kalır ve oturumu düşer.
    response = NextResponse.redirect(
      new URL(`${loginUrl}?auth_error=identity_exists&next=${encodeURIComponent(nextPath)}`, origin),
      { headers: response.headers }
    );
    const { data: ticket, error: ticketError } = await supabase.rpc("create_guest_merge_ticket");
    if (!ticketError && ticket) {
      response.cookies.set(MERGE_COOKIE, String(ticket), {
        path: "/auth/callback",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 900,
      });
    } else {
      await reportIssue({
        area: "auth",
        kind: "merge_ticket_failed",
        severity: "error",
        message: "Misafir birleştirme bileti kesilemedi",
        venueId,
        error: ticketError,
      });
    }
    clearPendingOauthCookies(response);
    return response;
  };
  const fail = (reason: string) => {
    response = NextResponse.redirect(new URL(`${loginUrl}?auth_error=${reason}`, origin), {
      headers: response.headers,
    });
    clearPendingOauthCookies(response);
    return response;
  };

  // Google kendi alan adımıza döndüyse (bkz. lib/google-oauth.ts) kodu biz
  // takas edip kimlik jetonunu Supabase'e veririz; yoksa eski Supabase dönüşü.
  const config = googleOAuthConfig();
  const direct = config
    ? readGoogleFlow(req.cookies.get(GOOGLE_FLOW_COOKIE)?.value, searchParams.get("state"), "customer")
    : null;

  let session;
  if (config && direct) {
    if (!code) return fail("missing_params");
    const tokens = await exchangeGoogleCode(config, direct, code);
    if (!tokens?.id_token) return fail("oauth_failed");
    const credentials: SignInWithIdTokenCredentials = {
      provider: "google",
      token: tokens.id_token,
      access_token: tokens.access_token,
    };
    // Misafir kimliği varsa Google hesabı ONA bağlanır (bkz. login sayfası)
    const { data, error } = direct.l
      ? await supabase.auth.linkIdentity(credentials)
      : await supabase.auth.signInWithIdToken(credentials);
    if (error?.code === "identity_already_exists") return identityExists();
    if (error || !data.session) {
      // linkIdentity yalnız "Manual linking" AÇIKKEN çalışır
      console.error("[google-auth]", error);
      return fail(direct.l ? "link_failed" : "oauth_failed");
    }
    session = data.session;
  } else {
    if (!code) {
      if (searchParams.get("error_code") === "identity_already_exists") return identityExists();
      return fail("missing_params");
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) return fail("oauth_failed");
    session = data.session;
  }

  // Misafirden mevcut hesaba geçiş: biletteki misafirin cüzdanı ve geçmişi bu
  // hesaba taşınır (0071). Hata girişi durdurmaz — jetonlar misafirde kalır,
  // Sorunlar ekranına düşer.
  const mergeTicket = req.cookies.get(MERGE_COOKIE)?.value;
  if (mergeTicket && !session.user.is_anonymous) {
    const { data: merged, error: mergeError } = await supabase.rpc("merge_guest_account", {
      p_ticket: mergeTicket,
    });
    if (mergeError || merged?.merged !== true) {
      await reportIssue({
        area: "auth",
        kind: "guest_merge_failed",
        severity: mergeError ? "error" : "warn",
        message: "Misafir hesabı mevcut hesaba birleştirilemedi",
        venueId,
        detail: { result: merged ?? null },
        error: mergeError,
      });
    }
    response.cookies.delete({ name: MERGE_COOKIE, path: "/auth/callback" });
  }

  // Kayıt ekranındaki onay kutuları Google'a giderken çerezle taşındı (0043);
  // oturum açıldığına göre şimdi damgalanabilir.
  if (req.cookies.get("pending_consent")?.value === "1") {
    await supabase.rpc("record_consents", {
      p_marketing: req.cookies.get("pending_consent_marketing")?.value === "1",
    });
  }

  // Onayı olmayan hesap (ör. giriş modunda Google ile ilk kez gelen kullanıcı)
  // mekana girmeden önce onay ekranından geçer.
  const { data: consentMissing, error: consentError } = await supabase.rpc("claim_signup_consents");
  if (!consentError && consentMissing === true) {
    response = NextResponse.redirect(
      new URL(`/venue/${venueId}/onay?next=${encodeURIComponent(nextPath)}`, origin),
      { headers: response.headers }
    );
  }

  setVenueAuthCookie(response, venueId, session.user.id);
  clearPendingOauthCookies(response);
  return response;
}

// Client path=/ ile set etti; pathsiz delete eşleşmez
function clearPendingOauthCookies(res: NextResponse) {
  res.cookies.delete({ name: "pending_oauth_venue", path: "/" });
  res.cookies.delete({ name: "pending_oauth_next", path: "/" });
  res.cookies.delete({ name: "pending_consent", path: "/" });
  res.cookies.delete({ name: "pending_consent_marketing", path: "/" });
  res.cookies.delete({ name: GOOGLE_FLOW_COOKIE, path: "/" });
}
