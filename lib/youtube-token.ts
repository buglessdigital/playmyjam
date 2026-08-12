import { NextRequest } from "next/server";

// Mekanın YouTube hesabına ait kısa ömürlü OAuth erişim jetonu.
//
// Neden çerez: jeton yalnızca "listelerimi göster → seçtiklerimi aktar" akışında,
// dakikalar içinde kullanılıyor. Veritabanında saklamak refresh token yönetimi,
// şifreleme ve iptal akışı gerektirirdi; bunlar ancak gizli listelerin GÜNLÜK
// senkronu istendiğinde gerekli olacak (bkz. lib/playlist-sync.ts).
//
// httpOnly: istemci JS'i jetonu okuyamaz. Ömür Google'ın verdiği 1 saatin biraz
// altında tutulur ki süresi dolmuş jetonla istek atıp 401 yemeyelim.
export const YOUTUBE_TOKEN_COOKIE = "pmj_yt_token";
export const YOUTUBE_TOKEN_MAX_AGE = 55 * 60;

export function youtubeTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: YOUTUBE_TOKEN_MAX_AGE,
  };
}

export function readYoutubeToken(req: NextRequest): string | null {
  return req.cookies.get(YOUTUBE_TOKEN_COOKIE)?.value ?? null;
}
