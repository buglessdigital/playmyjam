import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { UUID_RE } from "@/lib/business-server";

// Super admin "Sorunlar" ekranı (0061): bildirimlerin akıbeti + sunucunun
// yakaladığı hatalar. Müziğin susması ve sıra hataları ayrı ekranda (health).
const LIST_LIMIT = 300;
// Kabul edilen bildirimin gösterim onayı bu sürede gelmediyse "doğrulanmadı"
const UNCONFIRMED_AFTER_MS = 5 * 60_000;
const RESOLVE_MAX = 500;

export type PushFilter = "problems" | "no_device" | "failed" | "unconfirmed" | "all";
const PUSH_FILTERS = new Set<PushFilter>(["problems", "no_device", "failed", "unconfirmed", "all"]);

export type PushDeliveryRow = {
  id: string;
  created_at: string;
  venue_id: string | null;
  kind: string;
  audience: "customer" | "admin";
  recipient_id: string | null;
  recipient: string | null;
  status: "sent" | "partial" | "failed" | "no_device" | "not_configured";
  devices: number;
  accepted: number;
  expired: number;
  failed: number;
  error: string | null;
  title: string | null;
  shown_at: string | null;
  clicked_at: string | null;
  resolved_at: string | null;
};

export type SystemEventRow = {
  id: number;
  at: string;
  venue_id: string | null;
  area: string;
  kind: string;
  severity: "warn" | "error";
  message: string;
  detail: Record<string, unknown> | null;
  resolved_at: string | null;
};

type Counts = { total: number; sent: number; shown: number; no_device: number; failed: number };
export type OpsSummary = {
  // open_problems: "Sorunlu olanlar" süzgecinin çözülmemiş sayısı (0075)
  push: Counts & { clicked: number; unconfirmed: number; open_problems: number };
  push_by_kind: (Counts & { kind: string; audience: "customer" | "admin" })[];
  events: { total: number; error: number; warn: number; open: number };
  // Çözülmemişler
  events_by_area: Record<string, number>;
};

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const venueParam = params.get("venue");
  const venueId = venueParam && UUID_RE.test(venueParam) ? venueParam : null;
  const days = Math.min(30, Math.max(1, Number(params.get("days")) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const pushFilter = (PUSH_FILTERS.has(params.get("push") as PushFilter) ? params.get("push") : "problems") as PushFilter;
  const area = params.get("area");
  // Varsayılan: yalnız çözülmemişler
  const withResolved = params.get("resolved") === "1";

  let deliveries = supabaseAdmin
    .from("push_deliveries")
    .select("id, created_at, venue_id, kind, audience, recipient_id, status, devices, accepted, expired, failed, error, title, shown_at, clicked_at, resolved_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (venueId) deliveries = deliveries.eq("venue_id", venueId);
  if (!withResolved) deliveries = deliveries.is("resolved_at", null);
  const unconfirmedBefore = new Date(Date.now() - UNCONFIRMED_AFTER_MS).toISOString();
  if (pushFilter === "no_device") deliveries = deliveries.eq("status", "no_device");
  else if (pushFilter === "failed") deliveries = deliveries.in("status", ["failed", "partial", "not_configured"]);
  else if (pushFilter === "unconfirmed")
    deliveries = deliveries.in("status", ["sent", "partial"]).is("shown_at", null).lt("created_at", unconfirmedBefore);
  else if (pushFilter === "problems")
    deliveries = deliveries.or(
      `status.neq.sent,and(shown_at.is.null,created_at.lt."${unconfirmedBefore}")`
    );

  let events = supabaseAdmin
    .from("system_events")
    .select("id, at, venue_id, area, kind, severity, message, detail, resolved_at")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(LIST_LIMIT);
  if (venueId) events = events.eq("venue_id", venueId);
  if (!withResolved) events = events.is("resolved_at", null);
  if (area && /^[a-z_]{1,24}$/.test(area)) events = events.eq("area", area);

  const [summary, venues, deliveryRes, eventRes] = await Promise.all([
    supabaseAdmin.rpc("ops_summary", { p_venue: venueId, p_since: since }),
    supabaseAdmin.from("venues").select("id, name").order("name"),
    deliveries,
    events,
  ]);

  if (summary.error || deliveryRes.error || eventRes.error) {
    const errors = [summary.error, deliveryRes.error, eventRes.error];
    const missing = errors.some((e) => e?.code === "42P01" || e?.code === "PGRST202" || e?.code === "PGRST205");
    // resolved_at kolonu yok
    const noResolved = errors.some((e) => e?.code === "42703");
    return NextResponse.json(
      {
        error: missing
          ? "0061 migration uygulanmamış — SQL Editor'da çalıştır"
          : noResolved
            ? "0075 migration uygulanmamış — SQL Editor'da çalıştır"
            : "Kayıtlar yüklenemedi",
      },
      { status: 500 }
    );
  }

  // Alıcı adları: müşteri → profil kullanıcı adı, admin → panel kullanıcı adı
  const rows = (deliveryRes.data ?? []) as Omit<PushDeliveryRow, "recipient">[];
  const customerIds = [...new Set(rows.filter((r) => r.audience === "customer" && r.recipient_id).map((r) => r.recipient_id!))];
  const adminIds = [...new Set(rows.filter((r) => r.audience === "admin" && r.recipient_id).map((r) => r.recipient_id!))];
  const [profiles, admins] = await Promise.all([
    customerIds.length > 0
      ? supabaseAdmin.from("profiles").select("id, username").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; username: string | null }[] }),
    adminIds.length > 0
      ? supabaseAdmin.from("venue_admins").select("id, username").in("id", adminIds)
      : Promise.resolve({ data: [] as { id: string; username: string | null }[] }),
  ]);
  const names = new Map<string, string | null>([
    ...(profiles.data ?? []).map((p) => [p.id, p.username] as const),
    ...(admins.data ?? []).map((a) => [a.id, a.username] as const),
  ]);

  return NextResponse.json({
    now: new Date().toISOString(),
    venues: venues.data ?? [],
    summary: summary.data as OpsSummary,
    deliveries: rows.map((r) => ({ ...r, recipient: r.recipient_id ? names.get(r.recipient_id) ?? null : null })),
    events: (eventRes.data ?? []) as SystemEventRow[],
  });
}

// Toplu "çözüldü": { push: uuid[], events: number[] }. Zaten çözülmüş olana
// dokunulmaz (ilk çözülme anı korunur).
export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { push?: unknown; events?: unknown } | null;
  const push = (Array.isArray(body?.push) ? body.push : []).filter(
    (v): v is string => typeof v === "string" && UUID_RE.test(v)
  );
  const events = (Array.isArray(body?.events) ? body.events : []).filter(
    (v): v is number => Number.isSafeInteger(v) && (v as number) > 0
  );
  if (push.length + events.length === 0 || push.length + events.length > RESOLVE_MAX) {
    return NextResponse.json({ error: "Geçersiz seçim" }, { status: 400 });
  }

  const at = new Date().toISOString();
  const [p, e] = await Promise.all([
    push.length > 0
      ? supabaseAdmin.from("push_deliveries").update({ resolved_at: at }).in("id", push).is("resolved_at", null)
      : Promise.resolve({ error: null }),
    events.length > 0
      ? supabaseAdmin.from("system_events").update({ resolved_at: at }).in("id", events).is("resolved_at", null)
      : Promise.resolve({ error: null }),
  ]);
  if (p.error || e.error) {
    const noResolved = [p.error, e.error].some((x) => x?.code === "42703" || x?.code === "PGRST204");
    return NextResponse.json(
      { error: noResolved ? "0075 migration uygulanmamış — SQL Editor'da çalıştır" : "Kaydedilemedi" },
      { status: 500 }
    );
  }
  return NextResponse.json({ resolved: push.length + events.length });
}
