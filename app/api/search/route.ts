import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { searchVideos, YouTubeQuotaError, type TrackDetails } from "@/lib/youtube";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

type SearchTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
};

function slim(t: TrackDetails): SearchTrack {
  return {
    youtube_video_id: t.youtube_video_id,
    title: t.title,
    artist: t.artist,
    album_cover_url: t.album_cover_url,
    duration_ms: t.duration_ms,
  };
}

// Kota savunması üç katman: (1) songs tablosunda yerel arama (0 birim),
// (2) search_cache — aynı sorgu 30 gün YouTube'a gitmez, (3) ancak o zaman search.list.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q parametresi gerekli" }, { status: 400 });

  const cacheKey = q.toLocaleLowerCase("tr");

  // 1) Yerel katalog: daha önce herhangi bir mekanda seçilmiş şarkılar
  // (virgül/parantez PostgREST or() sözdizimini bozar — joker karakterlerle birlikte ayıkla)
  const like = `%${cacheKey.replace(/[%_,()\\]/g, "")}%`;
  const { data: localRows } = await supabaseAdmin
    .from("songs")
    .select("youtube_video_id, title, artist, album_cover_url, duration_ms")
    .eq("embeddable", true)
    .or(`title.ilike.${like},artist.ilike.${like}`)
    .order("view_count", { ascending: false })
    .limit(10);

  const local: SearchTrack[] = localRows ?? [];

  // Yerel sonuç yeterliyse YouTube'a hiç gitme
  if (local.length >= 8) {
    return NextResponse.json({ tracks: local, source: "local" });
  }

  // 2) Arama önbelleği
  const { data: cached } = await supabaseAdmin
    .from("search_cache")
    .select("results, cached_at")
    .eq("query", cacheKey)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS) {
    const tracks = mergeResults(local, cached.results as SearchTrack[]);
    return NextResponse.json({ tracks, source: "cache" });
  }

  // 3) YouTube search.list (100 birim)
  try {
    const results = (await searchVideos(q)).map(slim);

    await supabaseAdmin
      .from("search_cache")
      .upsert({ query: cacheKey, results, cached_at: new Date().toISOString() });

    return NextResponse.json({ tracks: mergeResults(local, results), source: "youtube" });
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      // Kota dolu — yerel sonuçlarla zarifçe devam et
      return NextResponse.json({ tracks: local, source: "local", quota_exceeded: true });
    }
    const message = err instanceof Error ? err.message : "Arama başarısız";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Yerel eşleşmeler önce (katalogda olanların id/play_count durumu client'ta zaten var)
function mergeResults(local: SearchTrack[], remote: SearchTrack[]): SearchTrack[] {
  const seen = new Set(local.map((t) => t.youtube_video_id));
  return [...local, ...remote.filter((t) => !seen.has(t.youtube_video_id))];
}
