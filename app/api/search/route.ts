import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { getSuperSession } from "@/lib/session";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { resolveVideoLink } from "@/lib/request-approval";
import { parseVideoId } from "@/lib/youtube-oembed";
import { dedupeSongs, searchTokens, tokenPattern } from "@/lib/search-match";

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
// Gösterilen sonuç sayısı ve kopyalar ayıklanmadan önce çekilen satır sayısı
const RESULT_LIMIT = 30;
const POOL_FETCH = 80;
// Kelime başına bir regex koşulu: uzun yapıştırılmış metinler sorguyu şişirmesin
const MAX_TOKENS = 6;

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

  // Ortak havuzda arama: HER kelime başlıkta ya da sanatçıda geçmeli (bkz.
  // lib/search-match.ts). Eskiden metnin tamamı tek parça aranıyordu ve
  // "sena sener f" gibi bir harf daha yazmak sonuçları tamamen siliyordu.
  // Kelimeler Türkçe harf sınıflarıyla regex'e açılır — metin JS'te
  // küçültülmez, "İ"/"ı" farkı sınıfın içinde çözülür.
  const tokens = searchTokens(q).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return NextResponse.json({ tracks: [], source: "pool" });

  let query = supabaseAdmin
    .from("songs")
    .select("youtube_video_id, title, artist, album_cover_url, duration_ms")
    .eq("embeddable", true);
  for (const token of tokens) {
    const pattern = tokenPattern(token);
    query = query.or(`title.imatch.${pattern},artist.imatch.${pattern}`);
  }
  // Kopyalar ayıklanacağı için fazladan çekilir: aynı şarkının klip/ses/sözler
  // videoları tek sonuca iner, en çok izleneni kalır
  const { data: localRows } = await query.order("view_count", { ascending: false }).limit(POOL_FETCH);

  const tracks = dedupeSongs((localRows ?? []) as SearchTrack[]).slice(0, RESULT_LIMIT);
  return NextResponse.json({ tracks, source: "pool" });
}
