import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { optionalTimestamp, text, UUID_RE } from "@/lib/business-server";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/business";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const kind = body.kind as ActivityKind;
  if (!ACTIVITY_KINDS.includes(kind) || kind === "stage_change") {
    return NextResponse.json({ error: "Geçersiz görüşme türü" }, { status: 400 });
  }
  const summary = text(body.summary, 4000);
  const outcome = text(body.outcome, 1000);
  if (!summary) return NextResponse.json({ error: "Görüşme özeti zorunlu (en fazla 4000 karakter)" }, { status: 400 });
  if (outcome === null) return NextResponse.json({ error: "Sonuç en fazla 1000 karakter olabilir" }, { status: 400 });
  const occurredAt = optionalTimestamp(body.occurred_at);
  if (occurredAt === undefined) return NextResponse.json({ error: "Geçersiz tarih" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("crm_activities")
    .insert({ lead_id: id, kind, summary, outcome, occurred_at: occurredAt ?? new Date().toISOString() })
    .select("id, kind, summary, outcome, occurred_at")
    .single();
  if (error) return NextResponse.json({ error: "Görüşme kaydedilemedi" }, { status: 500 });

  // Görüşme yapılan aday listede üste çıksın
  await supabaseAdmin.from("crm_leads").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json(data);
}
