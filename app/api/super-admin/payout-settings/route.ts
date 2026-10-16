import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { getAppleUnitPrice, getPayoutSettings, getUnitPrice, optionalNumber } from "@/lib/business-server";

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const [settings, unitPrice, appleUnitPrice] = await Promise.all([getPayoutSettings(), getUnitPrice(), getAppleUnitPrice()]);
  return NextResponse.json({ ...settings, unit_price: unitPrice, apple_unit_price: appleUnitPrice });
}

// Oranlar + App Store jeton birim fiyatı. Her değişiklik app_settings_history'ye
// düşer (0082); hakediş dönemin değerlerini oradan okur (lib/business-server.ts
// getPeriodTerms) — yani bugünkü değişiklik geçmiş dönemleri bozmaz.
export async function PUT(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const value: Record<string, number> = {};
  for (const key of ["vat_rate", "bank_fee_pct", "apple_fee_pct", "other_pct"]) {
    const n = optionalNumber(body[key], 0, 100);
    if (n === undefined || n === null) {
      return NextResponse.json({ error: "Oranlar 0-100 arasında olmalı" }, { status: 400 });
    }
    value[key] = Math.round(n * 100) / 100;
  }

  // Boş = App Store'da da web fiyatı geçerli
  const applePrice = optionalNumber(body.apple_unit_price, 0.01, 100_000);
  if (applePrice === undefined) {
    return NextResponse.json({ error: "App Store birim fiyatı pozitif bir sayı olmalı" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key: "payout_settings", value, updated_at: now }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Ayarlar kaydedilemedi" }, { status: 500 });

  const apple =
    applePrice === null
      ? await supabaseAdmin.from("app_settings").delete().eq("key", "apple_token_unit_price")
      : await supabaseAdmin
          .from("app_settings")
          .upsert({ key: "apple_token_unit_price", value: Math.round(applePrice * 100) / 100, updated_at: now }, { onConflict: "key" });
  if (apple.error) return NextResponse.json({ error: "App Store birim fiyatı kaydedilemedi" }, { status: 500 });

  return NextResponse.json({ ...value, apple_unit_price: applePrice });
}
