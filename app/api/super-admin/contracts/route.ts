import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { getVenueUsage } from "@/lib/business-server";
import { istanbulToday } from "@/lib/business";

// Tüm mekanlar + sözleşmeleri + son 30 günlük jeton kullanımı
export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const today = istanbulToday();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);

  const [venues, contracts, usage] = await Promise.all([
    supabaseAdmin.from("venues").select("id, slug, name, logo_url, status, created_at").order("name"),
    supabaseAdmin.from("venue_contracts").select("*"),
    getVenueUsage(from, tomorrow).catch(() => null),
  ]);
  if (venues.error || contracts.error || !usage) {
    return NextResponse.json({ error: "Sözleşmeler yüklenemedi" }, { status: 500 });
  }

  const byVenue = new Map(contracts.data.map((c) => [c.venue_id, c]));
  return NextResponse.json(
    venues.data.map((v) => ({
      venue: v,
      contract: byVenue.get(v.id) ?? null,
      usage30: usage.get(v.id) ?? { tokens: 0, requests: 0, last_spend_at: null },
    }))
  );
}
