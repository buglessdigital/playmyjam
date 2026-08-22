import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { getSuperSession } from "@/lib/session";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { resolveVideoLink } from "@/lib/request-approval";
import { parseVideoId } from "@/lib/youtube-oembed";

// Mekan panelinin arama ucu. YouTube search.list (100 birim) BURADAN KALDIRILDI —
// tek bir kalabalık gece günlük kotayı bitirebiliyordu.
//
// Yerine iki yol var, ikisi de kotasız ya da ihmal edilebilir:
//   1. Ortak havuz (songs) — tohumlanan katalog + bugüne kadar kullanılmış her
//      şarkı. Tüm mekanlar için ortak (bkz. scripts/seed-catalog.ts). 0 birim.
//   2. Admin bir YouTube bağlantısı yapıştırırsa o video doğrudan çözülür.
//      videos.list = 1 birim; günlük kotayla 10.000 yapıştırma.
const SEARCH_LIMIT = 20;
const SEARCH_WINDOW_SECONDS = 60;

type SearchTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
};

export async function GET(req: NextRequest) {
  const admin = await getVerifiedAdminSession(req);
  const caller = admin ? `admin:${admin.admin_id}` : getSuperSession(req) ? "super" : null;
  if (!caller) {
    return NextResponse.json({ error: "Bu uç yalnızca mekan panelinden kullanılır" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q parametresi gerekli" }, { status: 400 });

  const { allowed, retryAfter } = await consumeRateLimit(
    `search:${caller}`,
    SEARCH_LIMIT,
    SEARCH_WINDOW_SECONDS
  );
  if (!allowed) {
    return tooManyRequests(retryAfter, "Çok hızlı arama yapıyorsun, biraz yavaşla.");
  }

  // Yapıştırılan bağlantı: aramaya hiç girmez, video doğrudan çözülür.
  // Havuzda olmayan bir şarkıyı panele eklemenin yolu budur.
  if (parseVideoId(q)) {
    const resolved = await resolveVideoLink(q);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const track: SearchTrack = {
      youtube_video_id: resolved.youtube_video_id,
      title: resolved.title,
      artist: resolved.artist,
      album_cover_url: resolved.album_cover_url,
      duration_ms: resolved.duration_ms,
    };
    return NextResponse.json({ tracks: [track], source: "link" });
  }

  // Ortak havuzda arama. Metin KÜÇÜLTÜLMEZ: JS "İ"yi "i" yaparken Postgres
  // "i̇" (i + birleşik nokta) yapıyor, ilike o satırları hiç bulamıyordu.
  // (virgül/parantez PostgREST or() sözdizimini bozar — jokerlerle birlikte ayıkla)
  const like = `%${q.replace(/[%_,()\\]/g, "")}%`;
  const { data: localRows } = await supabaseAdmin
    .from("songs")
    .select("youtube_video_id, title, artist, album_cover_url, duration_ms")
    .eq("embeddable", true)
    .or(`title.ilike.${like},artist.ilike.${like}`)
    .order("view_count", { ascending: false })
    .limit(30);

  return NextResponse.json({ tracks: (localRows ?? []) as SearchTrack[], source: "pool" });
}
