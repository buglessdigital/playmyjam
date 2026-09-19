import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { getPayoutSettings, getUnitPrice, optionalNumber } from "@/lib/business-server";

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const [settings, unitPrice] = await Promise.all([getPayoutSettings(), getUnitPrice()]);
  return NextResponse.json({ ...settings, unit_price: unitPrice });
}

export async function PUT(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const value: Record<string, number> = {};
  for (const key of ["vat_rate", "bank_fee_pct", "other_pct"]) {
    const n = optionalNumber(body[key], 0, 100);
    if (n === undefined || n === null) {
      return NextResponse.json({ error: "Oranlar 0-100 arasında olmalı" }, { status: 400 });
    }
    value[key] = Math.round(n * 100) / 100;
  }

  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key: "payout_settings", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Ayarlar kaydedilemedi" }, { status: 500 });

  return NextResponse.json(value);
}
