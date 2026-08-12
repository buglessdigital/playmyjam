import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { sendPushToSubscription } from "@/lib/push";

// Mekan admininin cihazı için Web Push aboneliği. Müşteri ucunun (
// /api/notifications/subscribe) aynısı, tek farkı kimlik: admin oturumu bir
// Supabase auth kullanıcısı değil, imzalı çerezle taşınan venue_admins satırı —
// bu yüzden abonelik admin_id'ye bağlanır (bkz. 0045 migration).

export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // Aynı cihaz daha önce müşteri hesabıyla abone olmuş olabilir: endpoint tekil
  // olduğu için satır admine devreder (user_id boşaltılır, tersi de geçerli).
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      { admin_id: session.admin_id, user_id: null, endpoint, p256dh, auth },
      { onConflict: "endpoint" }
    );

  if (error) {
    return NextResponse.json({ error: "Kaydedilemedi" }, { status: 500 });
  }

  // Admin düğmeye bastıysa açıldığını görsün; sessiz tazelemede bildirim atılmaz
  if (body?.silent !== true) {
    await sendPushToSubscription(
      { endpoint, p256dh, auth },
      {
        title: "Bildirimler açık 🔔",
        body: "Müşteri şarkı talebi gönderdiğinde buraya düşecek.",
        tag: "pmj-push-test",
      }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("admin_id", session.admin_id);

  return NextResponse.json({ ok: true });
}
