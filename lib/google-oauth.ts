import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Google OAuth'u Supabase'in adresi yerine KENDİ alan adımız üzerinden yürütür.
//
// Neden: Google onay ekranında "…'ye devam et" kısmına dönüş adresinin alan
// adını yazar. Supabase akışında bu `<proje>.supabase.co` oluyor; o alan bizim
// olmadığı için Search Console'da doğrulanamıyor, marka doğrulaması geçmiyor ve
// ekranda ne "PlayMyJam" adı ne logo görünüyor. Supabase'in Custom Domain
// eklentisi bunu ayda ~10$ karşılığında çözüyor; bu modül aynı sonucu ücretsiz
// veriyor: Google playmyjam.com.tr'ye döner, kodu sunucumuz takas eder.
//
// Akışlar:
//   customer   → /auth/callback (mobilde /auth/native-callback üstünden),
//                kimlik jetonu signInWithIdToken / linkIdentity ile Supabase'e verilir
//   admin-link → /api/admin/google/callback, yalnız e-posta + sub okunur
//   youtube    → /api/admin/youtube/callback, yalnız erişim jetonu alınır
//
// Güvenlik: state (CSRF) + PKCE. Doğrulayıcı akışı başlatan tarayıcının httpOnly
// çerezinde durur; mobilde özel şemadan sızan bir kod başka tarayıcıda takas
// edilemez. Kimlik jetonunun imzası doğrulanmıyor: jeton Google'ın token
// uç noktasından doğrudan TLS ile alınıyor (OIDC Core 3.1.3.7), Supabase'e
// verilen kopyayı da Supabase ayrıca doğruluyor.
//
// Bu dosya Next'e bağımlı değil — `npm test` doğrudan çalıştırır.

export type GoogleFlow = "customer" | "admin-link" | "youtube";

export const GOOGLE_FLOW_COOKIE = "pmj_google_oauth";
export const GOOGLE_FLOW_MAX_AGE = 600;

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export interface GoogleFlowState {
  /** state parametresi */
  s: string;
  /** PKCE doğrulayıcısı */
  v: string;
  f: GoogleFlow;
  /** Google'a gönderilen dönüş adresi — takasta birebir aynısı gerekiyor */
  r: string;
  /** customer: misafir kimliğine bağla (linkIdentity) */
  l?: 1;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Ör. https://playmyjam.com.tr — Google'da kayıtlı dönüş adreslerinin kökü */
  origin: string;
}

/** Üç değişkenden biri eksikse null: çağıran eski Supabase akışında kalır. */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const origin = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ORIGIN;
  if (!clientId || !clientSecret || !origin) return null;
  return { clientId, clientSecret, origin };
}

export function redirectPath(flow: GoogleFlow, native: boolean): string {
  if (flow === "admin-link") return "/api/admin/google/callback";
  if (flow === "youtube") return "/api/admin/youtube/callback";
  // Google WebView'i reddettiği için mobilde giriş sistem tarayıcısında açılır;
  // dönüş oradan uygulamaya geri atılır (bkz. app/auth/native-callback)
  return native ? "/auth/native-callback" : "/auth/callback";
}

const base64url = (buf: Buffer) => buf.toString("base64url");

export function startGoogleFlow(
  config: GoogleOAuthConfig,
  flow: GoogleFlow,
  opts: { native?: boolean; link?: boolean } = {}
): { url: string; cookie: string } {
  const state: GoogleFlowState = {
    s: base64url(randomBytes(24)),
    v: base64url(randomBytes(48)),
    f: flow,
    r: `${config.origin}${redirectPath(flow, !!opts.native)}`,
    ...(flow === "customer" && opts.link ? { l: 1 as const } : {}),
  };

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: state.r,
    response_type: "code",
    scope: flow === "youtube" ? YOUTUBE_SCOPE : "openid email profile",
    state: state.s,
    code_challenge: base64url(createHash("sha256").update(state.v).digest()),
    code_challenge_method: "S256",
  });
  // Yanlış hesapla bağlamayı önlemek için kurtarma hesabında her seferinde hesap seçtir
  if (flow === "admin-link") params.set("prompt", "select_account");
  if (flow === "youtube") {
    // consent: kapsam ilk kez isteniyorsa Google onay ekranını atlamasın
    params.set("prompt", "consent");
    params.set("access_type", "online");
  }

  return {
    url: `${AUTHORIZE_URL}?${params}`,
    cookie: base64url(Buffer.from(JSON.stringify(state))),
  };
}

/**
 * Callback'te çerezi okur; state uyuşmuyorsa ya da başka akışa aitse null.
 * null dönerse istek bizim akışımız değildir (ör. eski Supabase dönüşü).
 */
export function readGoogleFlow(
  cookie: string | undefined,
  stateParam: string | null,
  flow: GoogleFlow
): GoogleFlowState | null {
  if (!cookie || !stateParam) return null;
  let state: GoogleFlowState;
  try {
    state = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (state?.f !== flow || typeof state.s !== "string" || typeof state.v !== "string") return null;
  const a = Buffer.from(state.s);
  const b = Buffer.from(stateParam);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return state;
}

export interface GoogleTokens {
  access_token: string;
  id_token?: string;
  scope?: string;
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  state: GoogleFlowState,
  code: string
): Promise<GoogleTokens | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: state.r,
        grant_type: "authorization_code",
        code_verifier: state.v,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.access_token !== "string") {
      console.error("[google-oauth] kod takası başarısız:", res.status, data?.error ?? "");
      return null;
    }
    return data as GoogleTokens;
  } catch (err) {
    console.error("[google-oauth] kod takası başarısız:", err);
    return null;
  }
}

export interface GoogleIdClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
}

/** Token uç noktasından doğrudan gelen kimlik jetonunun içeriği (bkz. dosya başı). */
export function idTokenClaims(idToken: string | undefined): GoogleIdClaims | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    return {
      sub: claims.sub,
      email: typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "",
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
    };
  } catch {
    return null;
  }
}

export function googleFlowCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: GOOGLE_FLOW_MAX_AGE,
  };
}
