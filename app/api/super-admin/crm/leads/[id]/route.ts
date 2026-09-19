import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { parseLeadFields, UUID_RE } from "@/lib/business-server";
import { STAGE_META, type LeadStage } from "@/lib/business";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const [lead, activities, tasks] = await Promise.all([
    supabaseAdmin.from("crm_leads").select("*, venues(id, slug, name)").eq("id", id).maybeSingle(),
    supabaseAdmin
      .from("crm_activities")
      .select("id, kind, summary, outcome, occurred_at")
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false }),
    supabaseAdmin
      .from("crm_tasks")
      .select("id, title, details, due_at, priority, done, done_at, created_at")
      .eq("lead_id", id)
      .order("done")
      .order("due_at", { ascending: true, nullsFirst: false }),
  ]);

  if (lead.error || activities.error || tasks.error) {
    return NextResponse.json({ error: "Aday yüklenemedi" }, { status: 500 });
  }
  if (!lead.data) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  return NextResponse.json({ ...lead.data, activities: activities.data, tasks: tasks.data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const parsed = parseLeadFields(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
  }

  const { data: current } = await supabaseAdmin.from("crm_leads").select("stage").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { ...parsed.data, updated_at: now };
  const stageChanged = parsed.data.stage !== undefined && parsed.data.stage !== current.stage;
  if (stageChanged) update.stage_changed_at = now;

  const { error } = await supabaseAdmin.from("crm_leads").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Aday güncellenemedi" }, { status: 500 });

  // Aşama geçişleri görüşme geçmişinde iz bıraksın
  if (stageChanged) {
    const from = STAGE_META[current.stage as LeadStage]?.label ?? current.stage;
    const to = STAGE_META[parsed.data.stage as LeadStage].label;
    await supabaseAdmin.from("crm_activities").insert({
      lead_id: id,
      kind: "stage_change",
      summary: `${from} → ${to}`,
      outcome: parsed.data.stage === "lost" ? String(parsed.data.lost_reason ?? "") : "",
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const { error } = await supabaseAdmin.from("crm_leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Aday silinemedi" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
