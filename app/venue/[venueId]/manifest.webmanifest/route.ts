import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";
import { getVenueBranding } from "@/lib/venue-cache";

// Müşterinin kurabildiği mekan uygulaması. Panelinkiyle aynı mantık
// (bkz. app/admin/[venueId]/manifest.webmanifest) ama hedef müşteri sayfası.
//
// iOS'ta bu kurulum zorunluluk: Safari sekmesinde web push API'leri hiç yok,
// bildirim ancak ana ekrana eklenmiş uygulamada çalışıyor. Talep onayının
// ömrü 10 dakika olduğu için bildirim gelmezse müşteri fırsatı kaçırıyor.
export async function GET(_req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  const venue = await getVenueBranding(venueId);
  if (!venue) return new NextResponse("Not found", { status: 404 });

  const base = `/venue/${venueId}`;
  const manifest: MetadataRoute.Manifest = {
    name: `${venue.name} · PlayMyJam`,
    short_name: venue.name.slice(0, 24),
    description: `${venue.name} için şarkı seç`,
    id: base,
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: "#0f0a18",
    theme_color: "#0f0a18",
    lang: "tr",
    categories: ["music", "entertainment"],
    icons: [
      { src: `${base}/app-icon/192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/app-icon/512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      // İkon zaten kenar boşluklu üretiliyor, Android'in maske kırpması güvenli.
      { src: `${base}/app-icon/512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
