import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { optionalDay, optionalNumber, text, UUID_RE } from "@/lib/business-server";
import { istanbulToday, type PayoutStatus } from "@/lib/business";

// Durum geçişleri: taslak → onaylı → ödendi; iptal her açık durumdan; geri alma bir adım
const TRANSITIONS: Record<string, { from: PayoutStatus[]; to: PayoutStatus }> = {
  approve: { from: ["draft"], to: "approved" },
  unapprove: { from: ["approved"], to: "draft" },
  pay: { from: ["approved"], to: "paid" },
  unpay: { from: ["paid"], to: "approved" },
  cancel: { from: ["draft", "approved"], to: "cancelled" },
  reopen: { from: ["cancelled"], to: "draft" },
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

  const { data: current } = await supabaseAdmin.from("venue_payouts").select("status").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  const status = current.status as PayoutStatus;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.action !== undefined) {
    const t = TRANSITIONS[body.action as string];
    if (!t) return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    if (!t.from.includes(status)) {
      return NextResponse.json({ error: "Bu hakediş şu anki durumunda bu işleme uygun değil" }, { status: 409 });
    }
    update.status = t.to;

    if (body.action === "pay") {
      const paidAt = optionalDay(body.paid_at);
      if (paidAt === undefined) return NextResponse.json({ error: "Geçersiz ödeme tarihi" }, { status: 400 });
      update.paid_at = paidAt ?? istanbulToday();
      const ref = text(body.payment_ref, 120);
      if (ref === null) return NextResponse.json({ error: "Dekont / referans en fazla 120 karakter" }, { status: 400 });
      update.payment_ref = ref;
    }
    if (body.action === "unpay") {
      update.paid_at = null;
      update.payment_ref = "";
    }
  }

  // Tutar alanları yalnızca ödeme yapılmadan önce değişebilir
  const editingAmount = body.adjustment !== undefined || body.adjustment_note !== undefined || body.due_date !== undefined;
  if (editingAmount && !(status === "draft" || status === "approved")) {
    return NextResponse.json({ error: "Ödenmiş ya da iptal edilmiş hakediş düzenlenemez" }, { status: 409 });
  }
  if (body.adjustment !== undefined) {
    const n = optionalNumber(body.adjustment, -10_000_000, 10_000_000);
    if (n === undefined) return NextResponse.json({ error: "Geçersiz düzeltme tutarı" }, { status: 400 });
    update.adjustment = Math.round((n ?? 0) * 100) / 100;
  }
  if (body.adjustment_note !== undefined) {
    const note = text(body.adjustment_note, 500);
    if (note === null) return NextResponse.json({ error: "Düzeltme açıklaması en fazla 500 karakter" }, { status: 400 });
    update.adjustment_note = note;
  }
  if (body.due_date !== undefined) {
    const d = optionalDay(body.due_date);
    if (!d) return NextResponse.json({ error: "Geçersiz vade tarihi" }, { status: 400 });
    update.due_date = d;
  }
  if (body.notes !== undefined) {
    const notes = text(body.notes, 2000);
    if (notes === null) return NextResponse.json({ error: "Not en fazla 2000 karakter" }, { status: 400 });
    update.notes = notes;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
  }

  // Durum yarışına karşı: okuduğumuz durum hâlâ geçerliyse yaz
  const { data, error } = await supabaseAdmin
    .from("venue_payouts")
    .update(update)
    .eq("id", id)
    .eq("status", status)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Hakediş güncellenemedi" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Hakediş bu arada değişti, sayfayı yenileyin" }, { status: 409 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  // Onaylı ya da ödenmiş kayıt silinmez; önce iptal edilmeli
  const { data, error } = await supabaseAdmin
    .from("venue_payouts")
    .delete()
    .eq("id", id)
    .in("status", ["draft", "cancelled"])
    .select("id");
  if (error) return NextResponse.json({ error: "Hakediş silinemedi" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Yalnızca taslak ya da iptal edilmiş hakediş silinebilir" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
