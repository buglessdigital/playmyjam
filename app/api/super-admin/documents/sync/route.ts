import { NextRequest, NextResponse } from "next/server";
import { getSuperSession } from "@/lib/session";
import { UUID_RE } from "@/lib/business-server";
import { syncVenueDocuments } from "@/lib/venue-documents";

// Belge setini sözleşme koşullarından yeniden üretir (ör. kesinti oranı ya da
// jeton fiyatı değiştikten sonra). Koşul kaydı bunu zaten kendiliğinden yapar.
export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const venueId = body?.venue_id;
  if (typeof venueId !== "string" || !UUID_RE.test(venueId)) {
    return NextResponse.json({ error: "Geçersiz mekan" }, { status: 400 });
  }
  try {
    return NextResponse.json(await syncVenueDocuments(venueId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Belgeler oluşturulamadı" }, { status: 500 });
  }
}
