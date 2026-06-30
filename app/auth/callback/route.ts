import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");

  const cookieStore = await cookies();
  const venueId = searchParams.get("venueId") || cookieStore.get("pending_oauth_venue")?.value;

  if (!code || !venueId) {
    return NextResponse.redirect(new URL("/", origin));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/venue/${venueId}`, origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/venue/${venueId}`, origin));
  }

  // Venue-spesifik cookie'yi set et
  const res = NextResponse.redirect(new URL(`/venue/${venueId}/queue`, origin));
  res.cookies.set(`venue_auth_${venueId}`, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/venue/${venueId}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.delete("pending_oauth_venue");
  return res;
}
