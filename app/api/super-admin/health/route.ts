import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { UUID_RE } from "@/lib/business-server";

// Mekan sağlık ekranı YALNIZCA iki şeyi raporlar (0055 venue_events'ten):
//   1. Kontrol dışı sessizlik — player'ın kendi ölçtüğü "mekan müzik isterken
//      ses yok" aralıkları (silence_start / silence_end, bkz. YouTubePlayer
//      trackSilence). Bilerek duraklatma ve cihazın uyuması/kapanması sayılmaz.
//   2. Hatalı sıra — müşteri isteği sırası geldiği hâlde çalmadı: başka şarkı
//      önüne geçti (out_of_order) ya da hiç çalmadan "çalındı" sayıldı
//      (never_played). Tetikleyici panelin bilerek yaptıklarını zaten ayırır.
// Diğer bütün kayıtlar (ağ, takılma, açılış/kapanış…) teşhis için tabloda
// kalır; ekrana yalnızca sessizliğin olası sebebi olarak yansır.
const EVENT_LIMIT = 2000;
// Panelin "oynatıcı çevrimdışı" eşiğiyle aynı: bitişi gelmemiş sessizlik ancak
// player hâlâ sinyal veriyorsa "sürüyor"dur
const LIVE_MS = 45_000;
// Müşteri isteği ilerletmeyle AYNI anda girdiyse (ilerletme sırayı seçtikten
// milisaniyeler sonra) atlanmış sayılmaz — yarış, sıra hatası değil
const ORDER_RACE_MS = 3_000;

const SILENCE_KINDS = ["silence_start", "silence_end"];
const ORDER_KINDS = ["out_of_order", "never_played"];

type EventRow = {
  id: number;
  venue_id: string;
  at: string;
  kind: string;
  actor: string | null;
  message: string;
  detail: Record<string, unknown> | null;
};

export type HealthIncident =
  | {
      type: "silence";
      id: string;
      venue_id: string;
      started_at: string;
      ended_at: string | null;
      seconds: number | null;
      // recovered | paused | sleep | closed | handoff | ongoing | unknown
      ended_by: string;
      causes: string[];
      song: string | null;
      playing_frozen: boolean;
    }
  | {
      type: "order";
      id: string;
      venue_id: string;
      at: string;
      kind: "out_of_order" | "never_played";
      message: string;
      offline: boolean;
    };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const venueId = params.get("venue");
  const days = Math.min(30, Math.max(1, Number(params.get("days")) || 7));
  const since = Date.now() - days * 86_400_000;

  let feed = supabaseAdmin
    .from("venue_events")
    .select("id, venue_id, at, kind, actor, message, detail")
    .in("kind", [...SILENCE_KINDS, ...ORDER_KINDS])
    .gte("at", new Date(since).toISOString())
    .order("at", { ascending: false })
    .limit(EVENT_LIMIT);
  if (venueId && UUID_RE.test(venueId)) feed = feed.eq("venue_id", venueId);

  const [venues, live, events] = await Promise.all([
    supabaseAdmin.from("venues").select("id, slug, name, status").order("name"),
    supabaseAdmin
      .from("now_playing")
      .select("venue_id, is_playing, video_id, last_heartbeat_at, songs(title, artist)"),
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
    songs: { title: string; artist: string } | { title: string; artist: string }[] | null;
  };
  const liveBy = new Map<string, Live>(((live.data as Live[] | null) ?? []).map((l) => [l.venue_id, l]));
  const now = Date.now();
  const isLive = (venue: string) => {
    const beat = liveBy.get(venue)?.last_heartbeat_at;
    return !!beat && now - Date.parse(beat) <= LIVE_MS;
  };

  const rows = (events.data as EventRow[] | null) ?? [];

  // --- 1. Sessizlikler: başlangıç ve bitiş silence_id ile eşleşir ---------
  const silences = new Map<string, { venue: string; start?: EventRow; end?: EventRow }>();
  for (const e of rows) {
    if (!SILENCE_KINDS.includes(e.kind)) continue;
    const sid = str(e.detail?.silence_id);
    if (!sid) continue;
    const s = silences.get(sid) ?? { venue: e.venue_id };
    if (e.kind === "silence_start") s.start = e;
    else s.end = e;
    silences.set(sid, s);
  }
  // Her mekanın EN SON sessizliği: bitişi yoksa ve player hâlâ canlıysa sürüyor.
  // Daha eski, bitişi olmayan sessizlikler player'ın kapanıp açılmasıyla
  // (Chrome sekmeyi atınca, çökünce) yarım kalmıştır.
  const latestStartByVenue = new Map<string, number>();
  for (const s of silences.values()) {
    if (!s.start) continue;
    const t = Date.parse(s.start.at);
    if (t > (latestStartByVenue.get(s.venue) ?? 0)) latestStartByVenue.set(s.venue, t);
  }

  const videoIds = new Set<string>();
  for (const s of silences.values()) {
    const v = str((s.end ?? s.start)?.detail?.video_id);
    if (v) videoIds.add(v);
  }

  // --- 2. Hatalı sıra: ilerletmeyle yarışan istekleri ayıkla -----------------
  const orderRows = rows.filter((e) => ORDER_KINDS.includes(e.kind));
  const skippedIds = orderRows
    .map((e) => str(e.detail?.skipped_queue_id))
    .filter((v): v is string => !!v && UUID_RE.test(v));

  const [songsRes, skippedRes] = await Promise.all([
    videoIds.size > 0
      ? supabaseAdmin.from("songs").select("youtube_video_id, title, artist").in("youtube_video_id", [...videoIds])
      : Promise.resolve({ data: [] as { youtube_video_id: string; title: string; artist: string }[] }),
    skippedIds.length > 0
      ? supabaseAdmin.from("queue").select("id, added_at").in("id", skippedIds)
      : Promise.resolve({ data: [] as { id: string; added_at: string }[] }),
  ]);
  const songBy = new Map((songsRes.data ?? []).map((s) => [s.youtube_video_id, `${s.title} — ${s.artist}`]));
  const skippedAddedAt = new Map((skippedRes.data ?? []).map((q) => [q.id, Date.parse(q.added_at)]));

  const incidents: HealthIncident[] = [];

  for (const [sid, s] of silences) {
    const endDetail = s.end?.detail ?? null;
    const startedAt = str(endDetail?.started_at) ?? s.start?.at ?? null;
    if (!startedAt || Date.parse(startedAt) < since) continue;
    const videoId = str((s.end ?? s.start)?.detail?.video_id);
    let endedBy: string;
    if (s.end) endedBy = str(endDetail?.ended_by) ?? "unknown";
    else if (isLive(s.venue) && Date.parse(startedAt) === latestStartByVenue.get(s.venue)) endedBy = "ongoing";
    else endedBy = "unknown";
    incidents.push({
      type: "silence",
      id: sid,
      venue_id: s.venue,
      started_at: startedAt,
      ended_at: s.end?.at ?? null,
      seconds:
        typeof endDetail?.seconds === "number"
          ? endDetail.seconds
          : endedBy === "ongoing"
            ? Math.round((now - Date.parse(startedAt)) / 1000)
            : null,
      ended_by: endedBy,
      causes: Array.isArray(endDetail?.causes) ? (endDetail.causes as unknown[]).filter((c): c is string => typeof c === "string") : [],
      song: videoId ? songBy.get(videoId) ?? null : null,
      playing_frozen: endDetail?.playing_frozen === true || s.start?.detail?.playing_frozen === true,
    });
  }

  for (const e of orderRows) {
    const skipped = str(e.detail?.skipped_queue_id);
    const addedAt = skipped ? skippedAddedAt.get(skipped) : undefined;
    if (e.kind === "out_of_order" && addedAt !== undefined && Date.parse(e.at) - addedAt < ORDER_RACE_MS) continue;
    incidents.push({
      type: "order",
      id: `order-${e.id}`,
      venue_id: e.venue_id,
      at: e.at,
      kind: e.kind as "out_of_order" | "never_played",
      message: e.message,
      // Bağlantı kesintisinde player kendi tamponundan çaldı (sync)
      offline: e.actor === "player-sync",
    });
  }

  const at = (i: HealthIncident) => Date.parse(i.type === "silence" ? i.started_at : i.at);
  incidents.sort((a, b) => at(b) - at(a));

  const day = now - 86_400_000;
  const counts = new Map<string, { silence: number; order: number }>();
  for (const i of incidents) {
    if (at(i) < day) continue;
    const c = counts.get(i.venue_id) ?? { silence: 0, order: 0 };
    c[i.type === "silence" ? "silence" : "order"]++;
    counts.set(i.venue_id, c);
  }

  return NextResponse.json({
    now: new Date(now).toISOString(),
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
        last24h: counts.get(v.id) ?? { silence: 0, order: 0 },
      };
    }),
    incidents,
  });
}
