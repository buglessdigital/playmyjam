import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // iyzipay: resources'ı fs.readdirSync + require() ile dinamik yükler —
  // Turbopack/webpack bunu statik olarak bundle edemez, native require gerekir.
  serverExternalPackages: ["iyzipay"],
  // Dinamik require'lar Vercel'in file-tracing'i tarafından tespit edilemeyebilir
  // (nft statik analiz yapar); paket serverless fonksiyona hiç kopyalanmazsa
  // runtime'da "ENOENT: lib/resources" ile patlar. Elle dahil ediliyor.
  outputFileTracingIncludes: {
    "/*": ["node_modules/iyzipay/**/*"],
  },
  images: {
    remotePatterns: [
      // YouTube video thumbnail'ları (kapak görseli olarak kullanılıyor)
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
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
