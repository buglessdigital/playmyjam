import { NextRequest, NextResponse } from "next/server";
import { getSuperSession } from "@/lib/session";
import { resolveMapsLink } from "@/lib/maps-link";

// Mekan düzenleme ekranındaki "Konumu bul": yapıştırılan Google Maps
// linkinden koordinatı çıkarır, kaydetmeden önce göstermek için.
export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim().slice(0, 2000) : "";
  if (!url) return NextResponse.json({ error: "Link boş" }, { status: 400 });

  const coords = await resolveMapsLink(url);
  if (!coords) {
    return NextResponse.json(
      { error: "Linkten konum çıkarılamadı — enlem ve boylamı elle girin" },
      { status: 422 }
    );
  }
  return NextResponse.json(coords);
}
