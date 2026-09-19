import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { parseLeadFields } from "@/lib/business-server";

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("crm_leads")
    .select(
      "id, name, contact_name, phone, city, district, venue_type, source, stage, priority, estimated_monthly_tokens, proposed_commission_pct, next_action, next_action_at, venue_id, stage_changed_at, created_at, updated_at, crm_activities(occurred_at)"
    )
    .order("updated_at", { ascending: false })
    .order("occurred_at", { referencedTable: "crm_activities", ascending: false })
    .limit(1, { referencedTable: "crm_activities" });

  if (error) return NextResponse.json({ error: "Adaylar yüklenemedi" }, { status: 500 });

  // Son görüşme tarihi listede "kaç gündür dokunulmadı" için lazım
  const leads = (data ?? []).map(({ crm_activities, ...lead }) => ({
    ...lead,
    last_activity_at: crm_activities?.[0]?.occurred_at ?? null,
  }));
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const parsed = parseLeadFields(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("crm_leads").insert(parsed.data).select("id").single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Bu başvuru zaten CRM'e aktarılmış" }, { status: 409 });
    }
    return NextResponse.json({ error: "Aday eklenemedi" }, { status: 500 });
  }

  // Başvurudan aktarıldıysa başvuru "arandı" sayılır — iki ekranda aynı iş tekrar edilmesin
  if (parsed.data.application_id) {
    await supabaseAdmin
      .from("venue_applications")
      .update({ status: "contacted", updated_at: new Date().toISOString() })
      .eq("id", parsed.data.application_id as string)
      .eq("status", "new");
  }

  return NextResponse.json({ id: data.id });
}
