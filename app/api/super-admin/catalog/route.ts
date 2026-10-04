import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { searchTokens, tokenPattern } from "@/lib/search-match";

// Super admin "Katalog" ekranı: ortak havuzda arama + hasat turunun durumu.
//
// Arama kuralı mekan panelindekiyle AYNI (lib/search-match.ts): her kelime
// başlık + sanatçı birleşiminde geçmeli. Burada kopyalar ayıklanmaz ve
// embeddable süzgeci yok — ekranın işi havuzda ne varsa olduğu gibi göstermek,
// "bu şarkı neden çıkmıyor" sorusunu ancak çalınamaz kayıtlar da görünürse
// yanıtlayabiliriz.
const RESULT_LIMIT = 60;
const MAX_TOKENS = 6;
// Betik bu süredir nabız atmadıysa tur ölmüştür (oturum kapandı, makine uyudu).
// Hasatta tek liste 20 sn sürebiliyor, nabız 5 sn'de bir atılıyor.
const STALE_AFTER_MS = 2 * 60_000;
const RUN_HISTORY = 8;

export type CatalogSong = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
  duration_ms: number;
  channel_title: string | null;
  view_count: number;
  embeddable: boolean;
};

export type CatalogRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  heartbeat_at: string;
  status: "running" | "done" | "budget" | "quota" | "error" | "stale";
  budget: number;
  units_spent: number;
  lists_total: number;
  lists_done: number;
  lists_deferred: number;
  songs_added: number;
  current_list: string | null;
  last_songs: string[] | null;
  note: string | null;
};

export type CatalogStats = {
  songs: number;
  artists: number | null;
  listsDone: number;
};

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q) return NextResponse.json({ songs: await search(q) });

  const withArtists = req.nextUrl.searchParams.get("full") === "1";
  const [stats, runs] = await Promise.all([loadStats(withArtists), loadRuns()]);
  return NextResponse.json({ stats, runs });
}

async function search(q: string): Promise<CatalogSong[]> {
  const tokens = searchTokens(q).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return [];

  let query = supabaseAdmin
    .from("songs")
    .select("youtube_video_id, title, artist, album_cover_url, duration_ms, channel_title, view_count, embeddable");
  for (const token of tokens) {
    const pattern = tokenPattern(token);
    query = query.or(`title.imatch.${pattern},artist.imatch.${pattern}`);
  }
  const { data, error } = await query.order("view_count", { ascending: false }).limit(RESULT_LIMIT);
  if (error) throw new Error(`songs okunamadı: ${error.message}`);
  return (data ?? []) as CatalogSong[];
}

async function loadStats(withArtists: boolean): Promise<CatalogStats> {
  // Şarkı sayısı 900 bini aştı: "exact" sayım her yoklamada tabloyu tarar,
  // ekran 5 saniyede bir yokluyor. Gövdesiz tahmini sayım yeter.
  const [songs, lists, artists] = await Promise.all([
    supabaseAdmin.from("songs").select("id", { count: "estimated", head: true }),
    supabaseAdmin.from("catalog_sources").select("playlist_id", { count: "estimated", head: true }),
    withArtists ? countArtists() : Promise.resolve(null),
  ]);
  return {
    songs: songs.count ?? 0,
    listsDone: lists.count ?? 0,
    artists,
  };
}

// Farklı sanatçı sayısı 900 bin satırda saniyeler sürüyor: yalnızca sayfa ilk
// açılışında (full=1) istenir, yoklamalarda hiç çağrılmaz.
async function countArtists(): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc("catalog_artist_count");
  if (error) return null; // RPC yoksa ekran sanatçı sayısını göstermez, patlamaz
  return typeof data === "number" ? data : null;
}

async function loadRuns(): Promise<CatalogRun[]> {
  const { data, error } = await supabaseAdmin
    .from("catalog_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(RUN_HISTORY);
  if (error) return [];

  const now = Date.now();
  return (data ?? []).map((row) => {
    const run = row as CatalogRun;
    // Betik ölmüşse tabloda hâlâ "running" yazıyor — ekrana öyle gösterilmez.
    const beat = new Date(run.heartbeat_at).getTime();
    if (run.status === "running" && now - beat > STALE_AFTER_MS) {
      return { ...run, status: "stale" as const };
    }
    return run;
  });
}
