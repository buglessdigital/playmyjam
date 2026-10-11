// İstemci tarafı anahtar: Google girişi kendi alan adımızdan mı (bkz.
// lib/google-oauth.ts), yoksa eski Supabase akışından mı gidecek?
//
// Yalnız NEXT_PUBLIC_GOOGLE_OAUTH_ORIGIN ile AÇILAN sayfada yeni akış kullanılır:
// Google dönüş adreslerinde joker kabul etmiyor, preview adresleri ve
// pmj-seven.vercel.app kayıtlı değil — oralarda eski akış çalışmaya devam eder.
// Geri dönüş: Vercel'de değişkeni silip yeniden derlemek.

export function directGoogleOAuth(): boolean {
  const origin = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ORIGIN;
  return !!origin && typeof window !== "undefined" && window.location.origin === origin;
}

export function googleStartUrl(params: Record<string, string>): string {
  return `/api/auth/google/start?${new URLSearchParams(params)}`;
}
