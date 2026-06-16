import { NextRequest, NextResponse } from "next/server";
import { getVenueAccessToken, getUserPlaylists } from "@/lib/spotify";
import { getAdminSession } from "@/lib/session";

// Mekana bağlı Spotify hesabının playlist'lerini listeler (toplu içe aktarma için)
export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const token = await getVenueAccessToken(session.venue_id);
    const playlists = await getUserPlaylists(token);
    return NextResponse.json({ playlists });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Playlist listesi alınamadı";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
