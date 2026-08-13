import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";
import { getVenueBranding } from "@/lib/venue-cache";

// Mekana özel PWA manifest'i. Kök manifest (app/manifest.ts) herkesi ana sayfaya
// açıyor; panel bu dosyayı kullanınca mekan admini "yükle" dediğinde cihazına
// doğrudan KENDİ paneline açılan, kendi adı ve logosuyla ayrı bir uygulama iner.
//
// "id" alanı kritik: tarayıcı kurulumları id'ye göre ayırır. Mekan başına farklı
// id olmasaydı ikinci mekan "zaten kurulu" sayılırdı.
export async function GET(_req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  const venue = await getVenueBranding(venueId);
  if (!venue) return new NextResponse("Not found", { status: 404 });

  const base = `/admin/${venueId}`;
  const manifest: MetadataRoute.Manifest = {
    name: `${venue.name} · PlayMyJam Panel`,
    // Ana ekranda ikonun altında bu yazar; uzun adlar zaten kırpılır.
    short_name: venue.name.slice(0, 24),
    description: `${venue.name} müzik paneli`,
    id: base,
    start_url: base,
    // Kapsam panelle sınırlı: panel dışına giden bağlantılar (ör. mekanın
    // müşteri sayfası) uygulamada değil tarayıcıda açılsın.
    scope: base,
    display: "standalone",
    background_color: "#0f0a18",
    theme_color: "#0f0a18",
    lang: "tr",
    categories: ["music", "entertainment", "business"],
    icons: [
      {
        src: `${base}/app-icon/192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/app-icon/512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/app-icon/512.png`,
        sizes: "512x512",
        type: "image/png",
        // İkon zaten kenar boşluklu üretiliyor, Android'in maske kırpması güvenli.
        purpose: "maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
