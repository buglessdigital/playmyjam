import { venueIconResponse } from "@/lib/venue-app-icon";

// Mekanın kurulu panel uygulaması için ikon (üretim: lib/venue-app-icon.tsx).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string; size: string }> }
) {
  const { venueId, size } = await params;
  return venueIconResponse(req, venueId, size);
}
