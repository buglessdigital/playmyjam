import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseSongInput } from "@/lib/validate";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const supabase = await createClient();
  // getClaims: JWT'yi yerelde doğrular — Auth sunucusuna gitmez
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  const email = (claimsData?.claims as { email?: string } | undefined)?.email ?? "";

  if (!userId) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseSongInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Üç bağımsız sorgu paralel — sıralı round-trip şelalesini önler
  const [venueRes, songRes, profileRes] = await Promise.all([
    supabaseAdmin.from("venues").select("id").eq("slug", venueId).single(),
    supabaseAdmin
      .from("songs")
      .upsert(
        {
          youtube_video_id: parsed.song.youtube_video_id,
          title: parsed.song.title,
          artist: parsed.song.artist,
          album_cover_url: parsed.song.album_cover_url,
          duration_ms: parsed.song.duration_ms,
        },
        { onConflict: "youtube_video_id" }
      )
      .select("id")
      .single(),
    supabase.from("profiles").select("username").eq("id", userId).single(),
  ]);

  const venue = venueRes.data;
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  const song = songRes.data;
  if (songRes.error || !song) {
    return NextResponse.json({ error: "Şarkı kaydedilemedi" }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from("song_requests").insert({
    venue_id: venue.id,
    song_id: song.id,
    user_id: userId,
    requested_by: profileRes.data?.username ?? email.split("@")[0] ?? "Misafir",
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: "İstek gönderilemedi" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
