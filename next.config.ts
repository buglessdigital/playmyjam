import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
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

export default nextConfig;
