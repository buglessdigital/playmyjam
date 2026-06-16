import { NextRequest, NextResponse } from "next/server";
import { getVenueAccessToken } from "@/lib/spotify";
import { requireVenueAccess } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  if (!requireVenueAccess(req, venueId)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const token = await getVenueAccessToken(venueId);

    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 204 || res.status === 404) {
      return NextResponse.json({ is_playing: false });
    }

    if (!res.ok) throw new Error("Spotify API hatası");

    const data: {
      is_playing: boolean;
      progress_ms: number;
      item: {
        name: string;
        duration_ms: number;
        artists: { name: string }[];
        album: { images: { url: string }[] };
      } | null;
    } = await res.json();
    if (!data?.item) return NextResponse.json({ is_playing: false });

    return NextResponse.json({
      is_playing: data.is_playing,
      title: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(", "),
      album_cover_url: data.item.album.images[0]?.url ?? null,
      progress_ms: data.progress_ms,
      duration_ms: data.item.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
