import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { setVenueAuthCookie } from "@/lib/venue-auth-cookie";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const venueId = searchParams.get("venueId") || req.cookies.get("pending_oauth_venue")?.value;

  if (!venueId) {
    return NextResponse.redirect(new URL("/?auth_error=missing_params", origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL(`/venue/${venueId}?auth_error=missing_params`, origin));
  }

  // Tek-response deseni: Supabase'in yazdığı session cookie'leri doğrudan
  // dönen redirect response'una gitsin — aksi halde ilk denemede sb-* cookie'leri
  // tarayıcıya ulaşmaz ve proxy kullanıcıyı login'e geri atar.
  let response = NextResponse.redirect(new URL(`/venue/${venueId}/queue`, origin));

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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    response = NextResponse.redirect(new URL(`/venue/${venueId}?auth_error=oauth_failed`, origin));
    response.cookies.delete({ name: "pending_oauth_venue", path: "/" });
    return response;
  }

  setVenueAuthCookie(response, venueId, data.session.user.id);
  // Client path=/ ile set etti; pathsiz delete eşleşmez
  response.cookies.delete({ name: "pending_oauth_venue", path: "/" });
  return response;
}
