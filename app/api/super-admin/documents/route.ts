import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { text, UUID_RE } from "@/lib/business-server";
import { forgetVenueDocumentState } from "@/lib/venue-documents";

const DOC_COLUMNS =
  "id, venue_id, title, body, status, sent_at, accepted_at, accepted_username, accepted_ip, accepted_user_agent, accepted_sha256, withdrawn_at, created_at, updated_at";

// ?venue_id= → o mekanın belgeleri + mekan/sözleşme bilgisi (şablon için)
// parametresiz → mekan başına belge durumu özeti (Sözleşmeler listesi rozetleri)
export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const venueId = req.nextUrl.searchParams.get("venue_id");
  if (!venueId) {
    const { data, error } = await supabaseAdmin
      .from("venue_documents")
      .select("venue_id, status")
      .neq("status", "withdrawn");
    if (error) return NextResponse.json({ error: "Belgeler yüklenemedi" }, { status: 500 });
    const summary: Record<string, { draft: number; pending: number; accepted: number }> = {};
    for (const d of data) {
      const s = (summary[d.venue_id] ??= { draft: 0, pending: 0, accepted: 0 });
      s[d.status as "draft" | "pending" | "accepted"]++;
    }
    return NextResponse.json(summary);
  }

  if (!UUID_RE.test(venueId)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const [venue, contract, docs] = await Promise.all([
    supabaseAdmin.from("venues").select("id, slug, name").eq("id", venueId).maybeSingle(),
    supabaseAdmin.from("venue_contracts").select("*").eq("venue_id", venueId).maybeSingle(),
    supabaseAdmin.from("venue_documents").select(DOC_COLUMNS).eq("venue_id", venueId).order("created_at", { ascending: false }),
  ]);
  if (venue.error || contract.error || docs.error) {
    return NextResponse.json({ error: "Belgeler yüklenemedi" }, { status: 500 });
  }
  if (!venue.data) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });

  return NextResponse.json({ venue: venue.data, contract: contract.data, documents: docs.data });
}

export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const venueId = body.venue_id;
  if (typeof venueId !== "string" || !UUID_RE.test(venueId)) {
    return NextResponse.json({ error: "Geçersiz mekan" }, { status: 400 });
  }
  const title = text(body.title, 200);
  const docBody = text(body.body, 100000);
  if (!title) return NextResponse.json({ error: "Başlık zorunlu (en fazla 200 karakter)" }, { status: 400 });
  if (!docBody) return NextResponse.json({ error: "Sözleşme metni zorunlu" }, { status: 400 });

  const send = body.send === true;
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("venue_documents")
    .insert({
      venue_id: venueId,
      title,
      body: docBody,
      status: send ? "pending" : "draft",
      sent_at: send ? now : null,
    })
    .select(DOC_COLUMNS)
    .single();
  if (error) {
    return NextResponse.json({ error: error.code === "23503" ? "Mekan bulunamadı" : "Belge kaydedilemedi" }, { status: 500 });
  }

  if (send) forgetVenueDocumentState(venueId);
  return NextResponse.json(data);
}
