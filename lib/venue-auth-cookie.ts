import type { NextResponse } from "next/server";

// Müşteri oturumunu venue'ya bağlayan cookie — Supabase session'ından bağımsız,
// bir mekana giriş diğer mekanlarda geçerli sayılmaz. Proxy (middleware runtime)
// de kullandığı için bu dosya sadece next/server tipine bağımlı kalmalı.
export const VENUE_AUTH_MAX_AGE = 60 * 60 * 24 * 180; // 180 gün, proxy'de kayan süre

export function venueAuthCookieName(venueId: string) {
  return `venue_auth_${venueId}`;
}

// Yanındaki JS'ten okunabilir işaret çerezi. Asıl çerez httpOnly olduğu için
// istemci "bu mekanda hesabım açık mı" sorusunu soramıyordu; kuyruk/gözat
// sayfaları misafire de açık olduğundan hesap gerektiren butonların önceden
// login'e yönlendirmesi gerekiyor. Yetkiyi hâlâ httpOnly çerez taşır — bu
// yalnızca arayüz ipucu, sunucu tarafında hiçbir yerde güvenilmez.
export function venueMemberCookieName(venueId: string) {
  return `venue_member_${venueId}`;
}

// Path "/" olmalı: /api/venue/... rotaları da bu çerezi görmeli, yoksa sunucu
// tarafında "kullanıcı gerçekten bu mekanda giriş yaptı mı" sorusu sorulamıyor.
// Adı zaten mekana özel olduğu için path daraltmasına gerek yok.
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function setVenueAuthCookie(res: NextResponse, venueId: string, userId: string) {
  res.cookies.set(venueAuthCookieName(venueId), userId, {
    ...cookieOptions(),
    maxAge: VENUE_AUTH_MAX_AGE,
  });
  res.cookies.set(venueMemberCookieName(venueId), "1", {
    ...cookieOptions(),
    httpOnly: false,
    maxAge: VENUE_AUTH_MAX_AGE,
  });
}

export function clearVenueAuthCookie(res: NextResponse, venueId: string) {
  const name = venueAuthCookieName(venueId);
  res.cookies.set(name, "", { ...cookieOptions(), maxAge: 0 });
  // Eski sürümde path mekana daraltılmıştı; o çerez silinmezse tarayıcıda kalır
  res.cookies.set(name, "", {
    ...cookieOptions(),
    path: `/venue/${venueId}`,
    maxAge: 0,
  });
  clearVenueMemberCookie(res, venueId);
}

// Yalnızca arayüz ipucunu düşür. Asıl çerez korunur: oturum anlık tazelenemediğinde
// 180 günlük mekan erişimini silmek kullanıcıyı gereksiz yere dışarı atardı.
export function clearVenueMemberCookie(res: NextResponse, venueId: string) {
  res.cookies.set(venueMemberCookieName(venueId), "", {
    ...cookieOptions(),
    httpOnly: false,
    maxAge: 0,
  });
}

// Kullanıcı bu mekanın giriş ekranından geçmiş mi? Supabase oturumu tek başına
// yetmiyor: A mekanında giriş yapan biri B'nin uçlarına istek gönderebiliyordu.
export function hasVenueSession(
  req: { cookies: { get(name: string): { value: string } | undefined } },
  venueSlug: string,
  userId: string
): boolean {
  return req.cookies.get(venueAuthCookieName(venueSlug))?.value === userId;
}
