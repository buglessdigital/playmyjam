import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";

const STATUSES = ["new", "contacted", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

const NOTES_MAX = 1000;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const update: Record<string, string> = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as Status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }
    update.status = body.status as string;
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > NOTES_MAX) {
      return NextResponse.json({ error: `Not en fazla ${NOTES_MAX} karakter olabilir` }, { status: 400 });
    }
    update.notes = body.notes.trim();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin.from("venue_applications").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Talep güncellenemedi" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await supabaseAdmin.from("venue_applications").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Talep silinemedi" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
