import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  const supabase = await createClient();
  // getClaims: JWT'yi yerelde doğrular — Auth sunucusuna gitmez
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const packageId = typeof body?.package_id === "string" ? body.package_id : "";
  if (!packageId) {
    return NextResponse.json({ error: "Paket seçilmedi" }, { status: 400 });
  }

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("slug", venueId)
    .single();
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  const { data: pkg } = await supabaseAdmin
    .from("token_packages")
    .select("id, tokens, price")
    .eq("id", packageId)
    .eq("venue_id", venue.id)
    .single();
  if (!pkg) {
    return NextResponse.json({ error: "Paket bulunamadı" }, { status: 404 });
  }

  // ÖDEME SİMÜLASYONU: Gerçek ödeme entegrasyonu (Stripe/iyzico vb.) buraya gelecek.
  // Ödeme onaylanmadan jeton eklenmemeli.

  // Global cüzdan: jeton mekandan bağımsız eklenir (0010)
  const { data: balance, error } = await supabaseAdmin.rpc("add_tokens", {
    p_user_id: userId,
    p_amount: pkg.tokens,
  });

  if (error) {
    return NextResponse.json({ error: "Jeton eklenemedi" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance });
}
