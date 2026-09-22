import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { UUID_RE } from "@/lib/business-server";

// Mekan sağlık ekranı: her mekanın canlı player durumu + son 24 saatteki
// uyarı/hata sayısı + olay akışı (0055 venue_events).
const FEED_LIMIT = 300;

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const venueId = params.get("venue");
  const level = params.get("level") ?? "problems"; // problems | errors | all
  const days = Math.min(30, Math.max(1, Number(params.get("days")) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const day = new Date(Date.now() - 86_400_000).toISOString();

  let feed = supabaseAdmin
    .from("venue_events")
    .select("id, venue_id, at, category, kind, severity, actor, message, detail")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(FEED_LIMIT);
  if (venueId && UUID_RE.test(venueId)) feed = feed.eq("venue_id", venueId);
  if (level === "problems") feed = feed.in("severity", ["warn", "error"]);
  if (level === "errors") feed = feed.eq("severity", "error");

  const [venues, live, recent, events] = await Promise.all([
    supabaseAdmin.from("venues").select("id, slug, name, status").order("name"),
    supabaseAdmin
      .from("now_playing")
      .select("venue_id, is_playing, video_id, last_heartbeat_at, player_claim, songs(title, artist)"),
    supabaseAdmin
      .from("venue_events")
      .select("venue_id, severity, at, message")
      .gte("at", day)
      .in("severity", ["warn", "error"])
      .order("at", { ascending: false })
      .limit(2000),
    feed,
  ]);

  if (venues.error || events.error) {
    return NextResponse.json({ error: "Sağlık kaydı yüklenemedi" }, { status: 500 });
  }

  type Live = {
    venue_id: string;
    is_playing: boolean | null;
    video_id: string | null;
    last_heartbeat_at: string | null;
    player_claim: string | null;
    songs: { title: string; artist: string } | { title: string; artist: string }[] | null;
  };
  const liveBy = new Map<string, Live>((live.data as Live[] | null ?? []).map((l) => [l.venue_id, l]));
  const counts = new Map<string, { warn: number; error: number; last: { at: string; message: string } | null }>();
  for (const e of recent.data ?? []) {
    const c = counts.get(e.venue_id) ?? { warn: 0, error: 0, last: null };
    if (e.severity === "error") c.error++;
    else c.warn++;
    if (!c.last) c.last = { at: e.at, message: e.message };
    counts.set(e.venue_id, c);
  }

  return NextResponse.json({
    now: new Date().toISOString(),
    venues: (venues.data ?? []).map((v) => {
      const l = liveBy.get(v.id);
      const song = Array.isArray(l?.songs) ? l?.songs[0] : l?.songs;
      return {
        ...v,
        live: {
          is_playing: l?.is_playing === true,
          has_song: !!l?.video_id,
          song: song ? `${song.title} — ${song.artist}` : null,
          last_heartbeat_at: l?.last_heartbeat_at ?? null,
        },
        last24h: counts.get(v.id) ?? { warn: 0, error: 0, last: null },
      };
    }),
    events: events.data ?? [],
  });
}
