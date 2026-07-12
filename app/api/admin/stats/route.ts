import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/session";

// Mekan istatistikleri: seçilen dönemdeki müşteri istekleri üzerinden
// özet sayılar, en çok istenen şarkılar ve saatlik aktivite dağılımı.
// Auto-fill kayıtları (user_id null) tüm metriklerin dışında tutulur.

const ALLOWED_DAYS = new Set([1, 7, 30]);

// Saat dilimi mekana göre sabit: İstanbul
const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hour12: false,
  timeZone: "Europe/Istanbul",
});

type QueueRow = {
  song_id: string;
  user_id: string;
  tokens_spent: number | null;
  priority: boolean;
  added_at: string;
  songs:
    | { title: string; artist: string; album_cover_url: string | null }
    | { title: string; artist: string; album_cover_url: string | null }[]
    | null;
};

export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : 1;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("queue")
    .select("song_id, user_id, tokens_spent, priority, added_at, songs(title, artist, album_cover_url)")
    .eq("venue_id", session.venue_id)
    .not("user_id", "is", null)
    .gte("added_at", since)
    .limit(10000);

  if (error) {
    return NextResponse.json({ error: "İstatistikler alınamadı" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as QueueRow[];

  const users = new Set<string>();
  let totalTokens = 0;
  let priorityCount = 0;
  const hourly = Array.from({ length: 24 }, () => 0);
  const songCounts = new Map<
    string,
    { title: string; artist: string; album_cover_url: string | null; count: number }
  >();

  for (const row of rows) {
    users.add(row.user_id);
    totalTokens += row.tokens_spent ?? 0;
    if (row.priority) priorityCount += 1;

    const hour = Number(hourFormatter.format(new Date(row.added_at))) % 24;
    hourly[hour] += 1;

    const songRel = row.songs;
    const song = Array.isArray(songRel) ? songRel[0] : songRel;
    const existing = songCounts.get(row.song_id);
    if (existing) {
      existing.count += 1;
    } else {
      songCounts.set(row.song_id, {
        title: song?.title ?? "Bilinmeyen şarkı",
        artist: song?.artist ?? "",
        album_cover_url: song?.album_cover_url ?? null,
        count: 1,
      });
    }
  }

  const topSongs = [...songCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  return NextResponse.json({
    days,
    total_requests: rows.length,
    total_tokens: totalTokens,
    unique_users: users.size,
    priority_count: priorityCount,
    top_songs: topSongs,
    hourly,
  });
}
