import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_LOOSE = 1000;

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

  // Fiyat/tutar asla client'tan alınmaz: ya paket id'si (fiyat DB satırından)
  // ya da tekli adet (fiyat = adet × app_settings'teki birim fiyat) gelir.
  const body = await req.json().catch(() => null);
  const packageId = typeof body?.package_id === "string" ? body.package_id : "";
  const looseTokens = body?.tokens;
  if ((packageId && looseTokens !== undefined) || (!packageId && looseTokens === undefined)) {
    return NextResponse.json({ error: "Paket veya jeton adedi seçilmeli" }, { status: 400 });
  }

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("slug", venueId)
    .single();
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  let amount: number;
  let total: number;

  if (packageId) {
    const { data: pkg } = await supabaseAdmin
      .from("global_token_packages")
      .select("id, tokens, price")
      .eq("id", packageId)
      .single();
    if (!pkg) {
      return NextResponse.json({ error: "Paket bulunamadı" }, { status: 404 });
    }
    amount = pkg.tokens;
    total = Number(pkg.price);
  } else {
    const qty = Number(looseTokens);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LOOSE) {
      return NextResponse.json({ error: `Jeton adedi 1-${MAX_LOOSE} arası tam sayı olmalı` }, { status: 400 });
    }
    // Para hesabı: birim fiyat cache'ten değil doğrudan DB'den okunur
    const { data: setting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "token_unit_price")
      .maybeSingle();
    const unitPrice = Number(setting?.value);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return NextResponse.json({ error: "Fiyat bilgisi alınamadı" }, { status: 500 });
    }
    amount = qty;
    total = qty * unitPrice;
  }

  // ÖDEME SİMÜLASYONU: Gerçek ödeme entegrasyonu buraya gelecek; çekilecek tutar
  // her zaman sunucuda hesaplanan `total` olmalı. Ödeme onaylanmadan jeton eklenmemeli.
  void total;

  // Global cüzdan: jeton mekandan bağımsız eklenir (0010); mekan yalnızca
  // ledger bağlamı olarak kayda geçer (0012)
  const { data: balance, error } = await supabaseAdmin.rpc("add_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_venue_id: venue.id,
    p_kind: "purchase",
  });

  if (error) {
    return NextResponse.json({ error: "Jeton eklenemedi" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance });
}
