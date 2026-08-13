import { venueIconResponse } from "@/lib/venue-app-icon";

// Müşterinin kurduğu mekan uygulamasının ikonu (üretim: lib/venue-app-icon.tsx).
// Panel ikonuyla aynı görsel: mekanın logosu, marka zemininde.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ venueId: string; size: string }> }
) {
  const { venueId, size } = await params;
  return venueIconResponse(venueId, size);
}
