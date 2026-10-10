// iOS Universal Links: masadaki plaket QR'ı (playmyjam.com.tr/venue/<slug>)
// uygulama kuruluysa doğrudan onu açsın. Apple bu dosyayı uygulama kurulurken
// (ve CDN'i üzerinden periyodik) çeker; uzantısız, JSON, yönlendirmesiz olmalı.
//
// Team ID Apple Developer hesabı açılınca APPLE_TEAM_ID env'ine girilir; o
// zamana kadar 404 — iOS bağlantıları tarayıcıda açmaya devam eder.
// Bkz. docs/notlar/pmj-mobil-uygulama-2026-10.md

const BUNDLE_ID = "com.playmyjam.app";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return new Response("Not found", { status: 404 });

  const body = {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${BUNDLE_ID}`],
          // Yalnızca müşteri paneli: arka yüz QR'ı (/<slug>/bilgi), yasal sayfalar
          // ve Google dönüşü (/auth/native-callback, özel şemayla çalışır) tarayıcıda kalır
          components: [{ "/": "/venue/*", comment: "Mekan müşteri paneli" }],
        },
      ],
    },
  };
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
