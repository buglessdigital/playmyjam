import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";

// Mekanın sözleşmeleri: taslaklar mekana görünmez
export async function GET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("venue_documents")
    .select("id, title, body, status, sent_at, accepted_at, accepted_username, accepted_sha256, withdrawn_at")
    .eq("venue_id", session.venue_id)
    .neq("status", "draft")
    .order("sent_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Sözleşmeler yüklenemedi" }, { status: 500 });
  return NextResponse.json(data);
}
