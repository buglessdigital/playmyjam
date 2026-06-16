import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEMO_AMOUNT = 10;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("slug", venueId)
    .single();
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  const { data: balance, error } = await supabaseAdmin.rpc("add_tokens", {
    p_user_id: user.id,
    p_venue_id: venue.id,
    p_amount: DEMO_AMOUNT,
  });

  if (error) {
    return NextResponse.json({ error: "Jeton eklenemedi" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance });
}
