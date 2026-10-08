import { NextRequest } from "next/server";

// Mobil uygulamada Google girişi dönüşü.
//
// Google, OAuth'u gömülü WebView'de yasaklıyor (disallowed_useragent); bu yüzden
// uygulama girişi SİSTEM tarayıcısında açar (bkz. login sayfası, lib/native-app.ts).
// Supabase oradan buraya ?code=… ile döner. Kodu burada TÜKETMİYORUZ: PKCE
// doğrulayıcısı ve pending_oauth_* çerezleri uygulamanın WebView'inde duruyor,
// sistem tarayıcısında değil. Sorgu olduğu gibi playmyjam:// şemasıyla uygulamaya
// geri atılır; uygulama onu WebView'de /auth/callback'e çevirir ve olağan akış
// (birleştirme bileti, onaylar, mekan çerezi) aynen çalışır.
//
// Yönlendirme 302 değil sayfa: bazı tarayıcı sekmeleri (SFSafariViewController)
// özel şemaya sunucu yönlendirmesini sessizce yutuyor; kullanıcı dokunuşuyla
// açılan bağlantı her yerde çalışır.

export function GET(req: NextRequest) {
  const target = `playmyjam://auth/callback${req.nextUrl.search}`;
  const href = escapeHtml(target);
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>PlayMyJam</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0f0a18;color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
  a{display:inline-block;margin-top:16px;padding:14px 28px;border-radius:16px;
    background:#e91e8c;color:#fff;font-weight:700;text-decoration:none}
  p{color:#9ca3af;font-size:14px}
</style>
</head>
<body>
<div>
  <h1 style="font-size:20px">Giriş tamamlandı</h1>
  <p>PlayMyJam uygulamasına dönülüyor…</p>
  <a href="${href}">Uygulamaya dön</a>
</div>
<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
