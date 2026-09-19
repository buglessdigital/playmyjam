import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { optionalTimestamp, text, UUID_RE } from "@/lib/business-server";
import { PRIORITIES, type Priority } from "@/lib/business";

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

  const update: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = text(body.title, 200);
    if (!title) return NextResponse.json({ error: "Görev başlığı zorunlu" }, { status: 400 });
    update.title = title;
  }
  if (body.details !== undefined) {
    const details = text(body.details, 2000);
    if (details === null) return NextResponse.json({ error: "Açıklama çok uzun" }, { status: 400 });
    update.details = details;
  }
  if (body.due_at !== undefined) {
    const dueAt = optionalTimestamp(body.due_at);
    if (dueAt === undefined) return NextResponse.json({ error: "Geçersiz tarih" }, { status: 400 });
    update.due_at = dueAt;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as Priority)) {
      return NextResponse.json({ error: "Geçersiz öncelik" }, { status: 400 });
    }
    update.priority = body.priority;
  }
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean") return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    update.done = body.done;
    update.done_at = body.done ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("crm_tasks").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Görev güncellenemedi" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const { error } = await supabaseAdmin.from("crm_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Görev silinemedi" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
