import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { YOUTUBE_TOKEN_COOKIE, youtubeTokenCookieOptions } from "@/lib/youtube-token";

// Mekan "YouTube hesabımdan seç" dediğinde Google buraya döner.
//
// /api/admin/google/callback'ten farkı: orada amaç hesabı kalıcı olarak mekana
// bağlamak (kurtarma adresi), burada amaç yalnızca bu oturumda listeleri okumak.
// Hiçbir şey venue_admins'e yazılmaz; alınan erişim jetonu kısa ömürlü çereze
// konur ve Supabase oturumu hemen kapatılır (panel girişi kendi çerezinden gelir).
function fail(origin: string, slug: string, reason: string) {
  const url = new URL(`/admin/${slug}`, origin);
  url.searchParams.set("youtube_error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;

  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.redirect(new URL("/", origin));
  }
  const slug = session.venue_slug;

  const code = searchParams.get("code");
  if (!code) {
    const denied = searchParams.get("error_description") || searchParams.get("error");
    return fail(origin, slug, denied ? "denied" : "missing_code");
  }

  const success = new URL(`/admin/${slug}`, origin);
  success.searchParams.set("youtube", "connected");
  const response = NextResponse.redirect(success);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return fail(origin, slug, "oauth_failed");
  }

  // provider_token = Google'ın verdiği erişim jetonu (Supabase'in kendi JWT'si değil).
  // Kapsam onaylanmadıysa Google jetonu yine verir ama listeler çağrısı 403 döner;
  // o hata listeleme adımında kullanıcıya anlaşılır şekilde gösteriliyor.
  const providerToken = data.session.provider_token;

  await supabase.auth.signOut({ scope: "local" });

  if (!providerToken) {
    return fail(origin, slug, "no_token");
  }

  response.cookies.set(YOUTUBE_TOKEN_COOKIE, providerToken, youtubeTokenCookieOptions());
  return response;
}
