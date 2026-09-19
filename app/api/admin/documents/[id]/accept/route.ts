import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { clientIp } from "@/lib/rate-limit";
import { documentHash, forgetVenueDocumentState, retireOlderAccepted } from "@/lib/venue-documents";
import { UUID_RE } from "@/lib/business-server";

// Mekan admininin sözleşme onayı. Onay anındaki metnin özeti, IP ve tarayıcı
// bilgisiyle birlikte saklanır; onaylanan belge bir daha değiştirilemez.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedAdminSession(req);
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (body?.confirm !== true) {
    return NextResponse.json({ error: "Onay kutusu işaretlenmeli" }, { status: 400 });
  }

  const { data: doc } = await supabaseAdmin
    .from("venue_documents")
    .select("id, title, body, status, updated_at")
    .eq("id", id)
    .eq("venue_id", session.venue_id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  if (doc.status !== "pending") {
    return NextResponse.json({ error: "Bu sözleşme artık onay beklemiyor" }, { status: 409 });
  }
  // Admin okurken super admin metni değiştirdiyse okunmamış metin onaylanmasın
  if (typeof body.seen_updated_at === "string" && body.seen_updated_at !== doc.updated_at) {
    return NextResponse.json({ error: "Sözleşme metni güncellendi, lütfen yeniden okuyun" }, { status: 409 });
  }

  const { data: admin } = await supabaseAdmin
    .from("venue_admins")
    .select("username")
    .eq("id", session.admin_id)
    .maybeSingle();

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("venue_documents")
    .update({
      status: "accepted",
      accepted_at: now,
      accepted_admin_id: session.admin_id,
      accepted_username: admin?.username ?? "",
      accepted_ip: clientIp(req),
      accepted_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
      accepted_sha256: documentHash(doc.title, doc.body),
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "pending")
    .eq("updated_at", doc.updated_at)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Onay kaydedilemedi" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Sözleşme bu arada değişti, sayfayı yenileyin" }, { status: 409 });

  forgetVenueDocumentState(session.venue_id);
  await retireOlderAccepted(session.venue_id, id, doc.title).catch(() => {});

  const { count } = await supabaseAdmin
    .from("venue_documents")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", session.venue_id)
    .eq("status", "pending");

  return NextResponse.json({ ok: true, remaining: count ?? 0 });
}
