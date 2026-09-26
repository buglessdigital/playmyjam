import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";

// Müşteri paneli arayüz analizi girişi (bkz. lib/ui-track.ts, 0058 ui_events).
// Anonim ve oturumsuz: herkes yazabildiği için her alan sınırlanır, bozuk
// olay sessizce atılır. Kayıt asıl işi etkilemesin diye yanıt hep 204.
const MAX_BODY = 48_000;
const MAX_EVENTS = 60;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const SID_RE = /^[0-9a-f-]{36}$/;
const ACTIONS = new Set(["song_added", "song_requested", "suggestion_sent", "checkout_started"]);

// Slug → mekan kimliği; fonksiyon örneği yaşadıkça bellekte kalır
const venueIds = new Map<string, { id: string | null; at: number }>();
const VENUE_TTL_MS = 10 * 60_000;

async function venueIdFor(slug: string): Promise<string | null> {
  const hit = venueIds.get(slug);
  if (hit && Date.now() - hit.at < VENUE_TTL_MS) return hit.id;
  const { data } = await supabaseAdmin.from("venues").select("id").eq("slug", slug).maybeSingle();
  const id = (data?.id as string | undefined) ?? null;
  venueIds.set(slug, { id, at: Date.now() });
  return id;
}

const noContent = () => new NextResponse(null, { status: 204 });

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;
const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Görüntüleme/aksiyon ayrıntısında yalnızca bilinen, küçük alanlar kalır
function cleanDetail(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const path = text(m.path, 200);
  if (path?.startsWith("/venue/")) out.path = path;
  const w = int(m.w, 0, 10_000);
  if (w !== null) out.w = w;
  const h = int(m.h, 0, 10_000);
  if (h !== null) out.h = h;
  if (typeof m.pwa === "boolean") out.pwa = m.pwa;
  if (m.lang === "tr" || m.lang === "en") out.lang = m.lang;
  const src = text(m.src, 40);
  if (src) out.src = src;
  const ref = text(m.ref, 60);
  if (ref) out.ref = ref;
  if (typeof m.priority === "boolean") out.priority = m.priority;
  const from = text(m.from, 20);
  if (from) out.from = from;
  const tokens = int(m.tokens, 0, 100_000);
  if (tokens !== null) out.tokens = tokens;
  return Object.keys(out).length > 0 ? out : null;
}

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return noContent();

  let body: { venue?: unknown; sid?: unknown; events?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return noContent();
    body = JSON.parse(raw);
  } catch {
    return noContent();
  }

  const slug = typeof body.venue === "string" ? body.venue : "";
  const sid = typeof body.sid === "string" ? body.sid : "";
  if (!SLUG_RE.test(slug) || !SID_RE.test(sid) || !Array.isArray(body.events)) return noContent();

  const limit = await consumeRateLimit(`ui-events:${clientIp(req)}`, 60, 60);
  if (!limit.allowed) return noContent();

  const venueId = await venueIdFor(slug);
  if (!venueId) return noContent();

  const now = Date.now();
  const rows = [];
  for (const item of body.events.slice(0, MAX_EVENTS)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const kind = e.k;
    if (kind !== "view" && kind !== "click" && kind !== "action") continue;
    const page = text(e.p, 80);
    if (!page?.startsWith("/")) continue;
    const target = text(e.tg, 60);
    if (kind === "action" && (!target || !ACTIONS.has(target))) continue;
    const t = typeof e.t === "number" && Math.abs(now - e.t) < MAX_AGE_MS ? e.t : now;
    rows.push({
      venue_id: venueId,
      at: new Date(t).toISOString(),
      session_id: sid,
      kind,
      page,
      target: kind === "view" ? null : target,
      sel: kind === "click" ? text(e.s, 120) : null,
      dead: kind === "click" && e.d === 1,
      rage: kind === "click" && e.r === 1,
      x: kind === "click" ? int(e.x, 0, 1000) : null,
      vy: kind === "click" ? int(e.vy, 0, 1000) : null,
      py: kind === "click" ? int(e.py, 0, 200_000) : null,
      detail: kind === "click" ? null : cleanDetail(e.m),
    });
  }
  if (rows.length === 0) return noContent();

  const { error } = await supabaseAdmin.from("ui_events").insert(rows);
  if (error) console.error("[ui-events] yazılamadı:", error.message);

  // Saklama süresi: ayrı cron yerine arada bir buradan budanır
  if (Math.random() < 0.002) {
    const cutoff = new Date(now - RETENTION_DAYS * 86_400_000).toISOString();
    after(async () => {
      const { error: e } = await supabaseAdmin.from("ui_events").delete().lt("at", cutoff);
      if (e) console.error("[ui-events] budanamadı:", e.message);
    });
  }

  return noContent();
}
