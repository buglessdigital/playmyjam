import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_FLOW_COOKIE,
  googleFlowCookieOptions,
  googleOAuthConfig,
  startGoogleFlow,
  type GoogleFlow,
} from "@/lib/google-oauth";

// Google girişinin kendi alan adımızdan başlangıcı (bkz. lib/google-oauth.ts).
//
//   ?flow=customer|admin-link|youtube
//   &link=1      customer: Google hesabı mevcut misafir kimliğine bağlanır
//   &native=1    mobil uygulama: dönüş /auth/native-callback üstünden
//   &format=json yönlendirme yerine { url } — mobilde WebView çerezi alır,
//                Google sayfası sistem tarayıcısında açılır
//
// Müşteri akışının mekan/hedef/onay bilgisi eskisi gibi pending_* çerezlerinde.

const FLOWS: GoogleFlow[] = ["customer", "admin-link", "youtube"];

export function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const flow = searchParams.get("flow") as GoogleFlow;
  const config = googleOAuthConfig();

  // Çerez başka bir alan adına yazılırsa dönüşte bulunamaz; istemci zaten
  // yalnız kayıtlı adreste buraya geliyor (lib/google-oauth-direct.ts)
  if (!config || config.origin !== origin || !FLOWS.includes(flow)) {
    return NextResponse.json({ error: "google_oauth_unavailable" }, { status: 400 });
  }

  const { url, cookie } = startGoogleFlow(config, flow, {
    native: searchParams.get("native") === "1",
    link: searchParams.get("link") === "1",
  });

  const response =
    searchParams.get("format") === "json"
      ? NextResponse.json({ url }, { headers: { "cache-control": "no-store" } })
      : NextResponse.redirect(url);
  response.cookies.set(GOOGLE_FLOW_COOKIE, cookie, googleFlowCookieOptions());
  return response;
}
