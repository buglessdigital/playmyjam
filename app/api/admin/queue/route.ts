import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const queueId = typeof body?.queue_id === "string" ? body.queue_id : "";
  if (!queueId || body?.status !== "removed") {
    return NextResponse.json({ error: "Eksik veya geçersiz alan" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("queue")
    .update({ status: "removed" })
    .eq("id", queueId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
