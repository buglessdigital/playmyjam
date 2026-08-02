import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseSongInput, parseSuggestionInput } from "@/lib/validate";
import { hasVenueSession } from "@/lib/venue-auth-cookie";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Öneri kutusu serbest metin ve doğrudan admin panelinde görünüyor — spam'i
// kişi başına sınırla (mekan listesinden gelen normal istekler kapsam dışı).
const SUGGEST_LIMIT = 5;
const SUGGEST_WINDOW_SECONDS = 10 * 60;

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

  // Oturum açık olmak yetmez: bu mekanın giriş ekranından geçilmiş olmalı
  if (!hasVenueSession(req, venueId, userId)) {
    return NextResponse.json({ error: "Bu mekana giriş yapmalısın" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  // İki gövde biçimi: katalogdaki bir şarkı (youtube_video_id) veya müşterinin
  // elle yazdığı öneri (suggested_title + suggested_artist)
  const isSuggestion =
    typeof body === "object" && body !== null && "suggested_title" in (body as object);

  if (isSuggestion) {
    return handleSuggestion(venueId, userId, email, body, supabase);
  }

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

// Serbest metin öneri: mekan listesinde olmayan şarkı için sanatçı + şarkı adı.
// song_id boş kalır; mekan şarkıyı playlist'ine ekleyince otomatik eşleşir
// (bkz. lib/suggestions.ts).
async function handleSuggestion(
  venueId: string,
  userId: string,
  email: string,
  body: unknown,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const parsed = parseSuggestionInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { allowed, retryAfter } = await consumeRateLimit(
    `suggest:${userId}`,
    SUGGEST_LIMIT,
    SUGGEST_WINDOW_SECONDS
  );
  if (!allowed) {
    return tooManyRequests(retryAfter, "Çok fazla öneri gönderdin, biraz sonra tekrar dene.");
  }

  const [venueRes, profileRes] = await Promise.all([
    supabaseAdmin.from("venues").select("id").eq("slug", venueId).single(),
    supabase.from("profiles").select("username").eq("id", userId).single(),
  ]);

  const venue = venueRes.data;
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  // Aynı kişi aynı şarkıyı tekrar yollarsa admin listesi şişmesin.
  // (Karşılaştırma bellekte: kullanıcının bekleyen önerisi hız sınırı gereği
  // zaten avuç içi kadar, ilike deseninde joker kaçırma derdi de olmuyor.)
  const { data: mine } = await supabaseAdmin
    .from("song_requests")
    .select("id, suggested_title, suggested_artist")
    .eq("venue_id", venue.id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .is("song_id", null);

  const lower = (s: string) => s.toLocaleLowerCase("tr");
  const duplicate = (mine ?? []).some(
    (r) =>
      lower(r.suggested_title ?? "") === lower(parsed.suggestion.suggested_title) &&
      lower(r.suggested_artist ?? "") === lower(parsed.suggestion.suggested_artist)
  );

  if (duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { error } = await supabaseAdmin.from("song_requests").insert({
    venue_id: venue.id,
    user_id: userId,
    suggested_title: parsed.suggestion.suggested_title,
    suggested_artist: parsed.suggestion.suggested_artist,
    requested_by: profileRes.data?.username ?? email.split("@")[0] ?? "Misafir",
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: "Öneri gönderilemedi" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
