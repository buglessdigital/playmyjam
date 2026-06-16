import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getSpotifyProfile } from "@/lib/spotify";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyState } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // İmzalı state hem CSRF koruması hem yetki kanıtı: yalnızca /api/spotify/auth
  // venue erişimi doğrulandıktan sonra üretir (HMAC, 10 dk geçerli). Çerez kontrolü
  // burada yapılmaz çünkü Spotify dönüşü 127.0.0.1'e gelir; kullanıcı localhost
  // üzerinden giriş yaptıysa çerez bu isteğe hiç gönderilmez.
  const parsed = verifyState(state);

  // Dönüş adresi state'ten gelir ki kullanıcı akışı başlattığı host'a dönsün
  const baseUrl = parsed?.origin || req.nextUrl.origin;

  if (error || !code || !parsed) {
    return NextResponse.redirect(new URL("/super-admin", baseUrl));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    // Hangi hesabın bağlandığı panelde gösterilir — yanlış hesap seçimi fark edilebilsin
    const profile = await getSpotifyProfile(tokens.access_token).catch(() => null);
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .update({
        spotify_access_token: tokens.access_token,
        spotify_refresh_token: tokens.refresh_token,
        spotify_token_expires_at: Date.now() + (tokens.expires_in - 60) * 1000,
        spotify_account_id: profile?.id ?? null,
        spotify_account_name: profile?.display_name || profile?.email || profile?.id || null,
      })
      .eq("id", parsed.venue_id)
      .select("slug")
      .single();

    const slug = venue?.slug ?? parsed.venue_id;
    return NextResponse.redirect(new URL(`/admin/${slug}`, baseUrl));
  } catch {
    return NextResponse.redirect(new URL("/super-admin", baseUrl));
  }
}
