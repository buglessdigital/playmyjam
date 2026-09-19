import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { UUID_RE } from "@/lib/business-server";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const { error } = await supabaseAdmin.from("crm_activities").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Kayıt silinemedi" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
