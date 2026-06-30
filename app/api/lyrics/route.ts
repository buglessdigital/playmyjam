import { NextRequest, NextResponse } from "next/server";
import { getLyrics } from "@/lib/lyrics";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trackId = searchParams.get("trackId");
  const title = searchParams.get("title");
  const artist = searchParams.get("artist");
  const durationMs = Number(searchParams.get("durationMs"));

  if (!trackId || !title || !artist || !durationMs) {
    return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
  }

  const lyrics = await getLyrics(trackId, title, artist, durationMs).catch(() => null);
  return NextResponse.json(
    { lyrics },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
