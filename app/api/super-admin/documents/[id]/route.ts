import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { text, UUID_RE } from "@/lib/business-server";
import { forgetVenueDocumentState, type VenueDocumentStatus } from "@/lib/venue-documents";

// send     : taslak → mekana gönderildi (panel onaylanana kadar kilitlenir)
// unsend   : gönderilmiş ama onaylanmamış → taslağa geri
// withdraw : gönderilmiş ya da onaylanmış belgeyi geçersiz kıl
const TRANSITIONS: Record<string, { from: VenueDocumentStatus[]; to: VenueDocumentStatus }> = {
  send: { from: ["draft"], to: "pending" },
  unsend: { from: ["pending"], to: "draft" },
  withdraw: { from: ["pending", "accepted"], to: "withdrawn" },
};

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

  const { data: doc } = await supabaseAdmin
    .from("venue_documents")
    .select("venue_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  const status = doc.status as VenueDocumentStatus;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (body.title !== undefined || body.body !== undefined) {
    // Onaylanmış metin değişmez; mekana gidenin metni düzeltilebilir ama
    // mekan eski metni okuyorsa onayı reddedilir (bkz. accept route'u)
    if (status !== "draft" && status !== "pending") {
      return NextResponse.json({ error: "Onaylanmış ya da geri çekilmiş belge düzenlenemez; yeni belge oluşturun" }, { status: 409 });
    }
    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return NextResponse.json({ error: "Başlık zorunlu (en fazla 200 karakter)" }, { status: 400 });
      update.title = title;
    }
    if (body.body !== undefined) {
      const docBody = text(body.body, 100000);
      if (!docBody) return NextResponse.json({ error: "Sözleşme metni zorunlu" }, { status: 400 });
      update.body = docBody;
    }
  }

  if (body.action !== undefined) {
    const t = TRANSITIONS[body.action as string];
    if (!t) return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    if (!t.from.includes(status)) {
      return NextResponse.json({ error: "Belge şu anki durumunda bu işleme uygun değil" }, { status: 409 });
    }
    update.status = t.to;
    if (body.action === "send") update.sent_at = now;
    if (body.action === "unsend") update.sent_at = null;
    if (body.action === "withdraw") update.withdrawn_at = now;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("venue_documents")
    .update(update)
    .eq("id", id)
    .eq("status", status)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Belge güncellenemedi" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Belge bu arada değişti (mekan onaylamış olabilir), sayfayı yenileyin" }, { status: 409 });

  forgetVenueDocumentState(doc.venue_id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  // Onay kaydı taşıyan belge silinmez — kanıt olarak kalır
  const { data, error } = await supabaseAdmin
    .from("venue_documents")
    .delete()
    .eq("id", id)
    .in("status", ["draft", "withdrawn"])
    .is("accepted_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: "Belge silinemedi" }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: "Yalnızca taslak ya da onaylanmamış geri çekilmiş belge silinebilir" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
