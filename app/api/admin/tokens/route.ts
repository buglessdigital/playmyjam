import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/session";

export async function PUT(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const packages = body?.packages;
  if (!Array.isArray(packages) || packages.length === 0) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  for (const pkg of packages) {
    const id = typeof pkg?.id === "string" ? pkg.id : "";
    const label = typeof pkg?.label === "string" ? pkg.label.trim() : "";
    const tokens = typeof pkg?.tokens === "number" ? Math.floor(pkg.tokens) : NaN;
    const price = typeof pkg?.price === "number" ? pkg.price : NaN;
    const popular = pkg?.popular === true;

    if (!id || !label || label.length > 40) {
      return NextResponse.json({ error: "Paket adı gerekli (en fazla 40 karakter)" }, { status: 400 });
    }
    if (!Number.isFinite(tokens) || tokens <= 0 || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "Jeton ve fiyat pozitif sayı olmalı" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("token_packages")
      .update({ label, tokens, price, popular })
      .eq("id", id)
      .eq("venue_id", session.venue_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
