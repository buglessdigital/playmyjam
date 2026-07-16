import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";

const MAX_PACKAGES = 4;

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const [{ data: setting }, { data: packages }] = await Promise.all([
    supabaseAdmin.from("app_settings").select("value").eq("key", "token_unit_price").maybeSingle(),
    supabaseAdmin
      .from("global_token_packages")
      .select("id, label, tokens, price, popular, display_order")
      .order("display_order"),
  ]);

  const unitPrice = Number(setting?.value);
  return NextResponse.json({
    unit_price: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 30,
    packages: packages ?? [],
  });
}

type PackageInput = { label: string; tokens: number; price: number; popular: boolean };

export async function PUT(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const unitPrice = Number(body.unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return NextResponse.json({ error: "Birim fiyat pozitif bir sayı olmalı" }, { status: 400 });
  }

  if (!Array.isArray(body.packages) || body.packages.length > MAX_PACKAGES) {
    return NextResponse.json({ error: `En fazla ${MAX_PACKAGES} paket tanımlanabilir` }, { status: 400 });
  }

  const packages: PackageInput[] = [];
  for (const raw of body.packages) {
    const label = typeof raw?.label === "string" ? raw.label.trim() : "";
    const tokens = Number(raw?.tokens);
    const price = Number(raw?.price);
    if (!label || label.length > 40) {
      return NextResponse.json({ error: "Paket adı 1-40 karakter olmalı" }, { status: 400 });
    }
    if (!Number.isInteger(tokens) || tokens <= 0) {
      return NextResponse.json({ error: "Jeton adedi pozitif tam sayı olmalı" }, { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "Paket fiyatı pozitif bir sayı olmalı" }, { status: 400 });
    }
    packages.push({ label, tokens, price, popular: raw?.popular === true });
  }

  if (packages.filter((p) => p.popular).length > 1) {
    return NextResponse.json({ error: "Yalnızca bir paket popüler işaretlenebilir" }, { status: 400 });
  }

  const { error: settingError } = await supabaseAdmin
    .from("app_settings")
    .upsert(
      { key: "token_unit_price", value: unitPrice, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (settingError) {
    return NextResponse.json({ error: "Birim fiyat kaydedilemedi" }, { status: 500 });
  }

  // Paketler topluca değiştirilir (max 4 kuralı doğal olarak korunur);
  // önce sil sonra ekle — tek-popüler partial unique index'i geçici çakışma görmesin
  const { error: deleteError } = await supabaseAdmin
    .from("global_token_packages")
    .delete()
    .not("id", "is", null);
  if (deleteError) {
    return NextResponse.json({ error: "Paketler güncellenemedi" }, { status: 500 });
  }

  if (packages.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("global_token_packages").insert(
      packages.map((p, i) => ({ ...p, display_order: i + 1 }))
    );
    if (insertError) {
      return NextResponse.json({ error: "Paketler kaydedilemedi" }, { status: 500 });
    }
  }

  revalidateTag("global-pricing", "max");
  return NextResponse.json({ ok: true });
}
