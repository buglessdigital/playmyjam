import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { optionalTimestamp, text, UUID_RE } from "@/lib/business-server";
import { PRIORITIES, type Priority } from "@/lib/business";

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  // Açık görevlerin hepsi + son 30 günde tamamlananlar
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("crm_tasks")
    .select("id, title, details, due_at, priority, done, done_at, created_at, lead_id, venue_id, crm_leads(id, name), venues(id, name, slug)")
    .or(`done.eq.false,done_at.gte.${since}`)
    .order("done")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) return NextResponse.json({ error: "Görevler yüklenemedi" }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const title = text(body.title, 200);
  const details = text(body.details, 2000);
  if (!title) return NextResponse.json({ error: "Görev başlığı zorunlu (en fazla 200 karakter)" }, { status: 400 });
  if (details === null) return NextResponse.json({ error: "Açıklama en fazla 2000 karakter olabilir" }, { status: 400 });

  const dueAt = optionalTimestamp(body.due_at);
  if (dueAt === undefined) return NextResponse.json({ error: "Geçersiz tarih" }, { status: 400 });

  const priority = (body.priority ?? "normal") as Priority;
  if (!PRIORITIES.includes(priority)) return NextResponse.json({ error: "Geçersiz öncelik" }, { status: 400 });

  const leadId = body.lead_id || null;
  const venueId = body.venue_id || null;
  if ((leadId && !UUID_RE.test(leadId)) || (venueId && !UUID_RE.test(venueId))) {
    return NextResponse.json({ error: "Geçersiz bağlantı" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("crm_tasks")
    .insert({ title, details, due_at: dueAt, priority, lead_id: leadId, venue_id: venueId })
    .select("id, title, details, due_at, priority, done, done_at, created_at, lead_id, venue_id, crm_leads(id, name), venues(id, name, slug)")
    .single();
  if (error) return NextResponse.json({ error: "Görev eklenemedi" }, { status: 500 });

  return NextResponse.json(data);
}
