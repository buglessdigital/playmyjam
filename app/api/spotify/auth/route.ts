import { NextRequest, NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify";
import { requireVenueAccess, signState } from "@/lib/session";

export async function GET(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get("venueId");
  if (!venueId) return NextResponse.json({ error: "venueId gerekli" }, { status: 400 });

  if (!requireVenueAccess(req, venueId)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const url = getSpotifyAuthUrl(signState(venueId, req.nextUrl.origin));
  return NextResponse.redirect(url);
}
