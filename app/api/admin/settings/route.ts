import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";

// Bir şarkı isteğinin jeton maliyeti mekana özeldir (varsayılan 1 / 2).
// Jeton fiyatı globaldir — burada değişen sadece kaç jeton harcandığı.
const MAX_COST = 50;

function parseCost(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const cost = Number(value);
  if (!Number.isInteger(cost) || cost < 1 || cost > MAX_COST) return null;
  return cost;
}

export async function GET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("name, request_cost, priority_cost")
    .eq("id", session.venue_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }
  return NextResponse.json({
    name: data.name,
    request_cost: data.request_cost ?? 1,
    priority_cost: data.priority_cost ?? 2,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requestCost = parseCost(body?.requestCost);
  const priorityCost = parseCost(body?.priorityCost);
  if (requestCost === null || priorityCost === null) {
    return NextResponse.json(
      { error: `İstek ücretleri 1 ile ${MAX_COST} arasında tam sayı olmalı` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("venues")
    .update({ request_cost: requestCost, priority_cost: priorityCost })
    .eq("id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Müşteri sayfaları ücreti önbellekli mekan satırından okuyor (lib/venue-cache)
  revalidateTag(`venue-${session.venue_slug}`, "max");
  return NextResponse.json({ ok: true, request_cost: requestCost, priority_cost: priorityCost });
}
