import { NextRequest, NextResponse } from "next/server";
import { getClientCredentialsToken } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q parametresi gerekli" }, { status: 400 });

  try {
    const token = await getClientCredentialsToken();

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10&market=TR`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error("Spotify arama başarısız");

    interface SpotifySearchTrack {
      id: string;
      name: string;
      duration_ms: number;
      preview_url: string | null;
      artists: { name: string }[];
      album: { images: { url: string }[] };
    }

    const data: { tracks: { items: SpotifySearchTrack[] } } = await res.json();

    const tracks = data.tracks.items.map((t) => ({
      spotify_track_id: t.id,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      album_cover_url: t.album.images[0]?.url ?? null,
      duration_ms: t.duration_ms,
      preview_url: t.preview_url,
    }));

    return NextResponse.json({ tracks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
