import type { NextResponse } from "next/server";

// Müşteri oturumunu venue'ya bağlayan cookie — Supabase session'ından bağımsız,
// bir mekana giriş diğer mekanlarda geçerli sayılmaz. Proxy (middleware runtime)
// de kullandığı için bu dosya sadece next/server tipine bağımlı kalmalı.
export const VENUE_AUTH_MAX_AGE = 60 * 60 * 24 * 180; // 180 gün, proxy'de kayan süre

export function venueAuthCookieName(venueId: string) {
  return `venue_auth_${venueId}`;
}

function cookieOptions(venueId: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: `/venue/${venueId}`,
  };
}

export function setVenueAuthCookie(res: NextResponse, venueId: string, userId: string) {
  res.cookies.set(venueAuthCookieName(venueId), userId, {
    ...cookieOptions(venueId),
    maxAge: VENUE_AUTH_MAX_AGE,
  });
}

export function clearVenueAuthCookie(res: NextResponse, venueId: string) {
  res.cookies.set(venueAuthCookieName(venueId), "", {
    ...cookieOptions(venueId),
    maxAge: 0,
  });
}
