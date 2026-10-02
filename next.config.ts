import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    // Vercel'in görsel optimizasyonu kapalı: her farklı kapak × genişlik ayrı
    // "transformation" sayılıyor ve büyük katalogda Hobby kotasını (5K/ay)
    // aşıp hesabı duraklattı. YouTube kapakları zaten küçük, sıkıştırılmış JPG.
    unoptimized: true,
    remotePatterns: [
      // YouTube video thumbnail'ları (kapak görseli olarak kullanılıyor)
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  async redirects() {
    return [
      {
        // Playlist yönetimi ana ekrana taşındı (sol ray + orta pano). Eski
        // yer imleri ve ?list=... bağlantıları kırılmasın — sorgu korunur.
        source: "/admin/:venueId/playlist",
        destination: "/admin/:venueId",
        permanent: false,
      },
      {
        source: "/admin/:venueId/playlists",
        destination: "/admin/:venueId",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Müşteri paneli yalnızca kendi sitemizde çerçevelenebilir: super admin
        // arayüz analizi ısı haritasını sayfanın canlı görüntüsünün üstüne çiziyor.
        // Aynı anahtarı sonraki kural ezer (yukarıdaki DENY'ı).
        source: "/venue/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Service worker her zaman güncel kalmalı
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

// Sentry: build sırasında kaynak haritalarını yükler (hata yığınları gerçek
// dosya/satırı gösterir). SENTRY_AUTH_TOKEN yoksa (yerel build) yükleme atlanır.
// Olaylar /monitoring üzerinden kendi alan adımızdan geçer — reklam engelleyiciler
// sentry.io'yu kestiği için aksi halde müşteri hatalarının bir kısmı hiç gelmez.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});
