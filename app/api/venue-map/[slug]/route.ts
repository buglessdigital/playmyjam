import { NextRequest, NextResponse } from "next/server";
import { getVenueMapCard } from "@/lib/venue-map";

// Haritada mekana dokununca açılan kart: şu an çalan, sıradaki 10 şarkı,
// en çok çalınanlar ve türler. Kimlik gerektirmez — yalnız şarkı bilgisi
// döner, kimin eklediği yok.
//
// Sıra sık değiştiği için CDN'de kısa tutulur; aynı mekana aynı anda bakan
// müşteriler veritabanına tek istek olarak düşer.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getVenueMapCard(slug);
  if (!card) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(card, {
    headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
  });
}
