import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { UUID_RE } from "@/lib/business-server";

// Arayüz analizi (0058): toplamlar ve ısı haritası veritabanında hesaplanır
// (ui_analytics / ui_heatmap RPC'leri) — ham olaylar buraya taşınmaz.

export type UiAnalytics = {
  totals: {
    sessions: number;
    views: number;
    clicks: number;
    avg_session_seconds: number;
    bounce: number;
    dead: number;
    rage: number;
    // dead veya rage (ikisi çoğu kez aynı tıklama)
    problem: number;
  };
  funnel: Record<"sessions" | "interacted" | "browse" | "added" | "requested" | "tokens" | "checkout", number>;
  pages: {
    page: string;
    views: number;
    sessions: number;
    avg_seconds: number | null;
    entries: number;
    exits: number;
    clicks: number;
    dead: number;
    rage: number;
    problem: number;
  }[];
  targets: { page: string; target: string | null; sel: string | null; clicks: number; sessions: number; dead: number; rage: number }[];
  flows: { from: string; to: string; n: number }[];
  actions: Record<string, number>;
  hours: Record<string, number>;
  days: { day: string; sessions: number }[];
  devices: Record<"pwa" | "browser" | "en" | "narrow" | "phone" | "wide", number>;
};

export type UiHeatmap = {
  points: [number, number, number][];
  total: number;
  max_py: number;
  sample_path: string | null;
};

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const venueParam = params.get("venue");
  const venue = venueParam && UUID_RE.test(venueParam) ? venueParam : null;
  const days = Math.min(90, Math.max(1, Number(params.get("days")) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const heatPage = params.get("heatmap");
  if (heatPage) {
    const mode = params.get("mode") === "page" ? "page" : "screen";
    const filter = params.get("filter");
    const { data, error } = await supabaseAdmin.rpc("ui_heatmap", {
      p_venue: venue,
      p_since: since,
      p_page: heatPage.slice(0, 80),
      p_mode: mode,
      p_filter: filter === "dead" || filter === "rage" ? filter : "all",
    });
    if (error) return NextResponse.json({ error: "Isı haritası yüklenemedi" }, { status: 500 });
    return NextResponse.json(data as UiHeatmap);
  }

  const [venues, stats] = await Promise.all([
    supabaseAdmin.from("venues").select("id, slug, name, status").order("name"),
    supabaseAdmin.rpc("ui_analytics", { p_venue: venue, p_since: since }),
  ]);
  if (venues.error || stats.error) {
    return NextResponse.json({ error: "Analiz yüklenemedi" }, { status: 500 });
  }

  return NextResponse.json({ venues: venues.data ?? [], stats: stats.data as UiAnalytics });
}
