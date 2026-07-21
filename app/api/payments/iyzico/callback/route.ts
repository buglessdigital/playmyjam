import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { retrieveCheckoutForm, verifyCheckoutFormSignature } from "@/lib/iyzico";

// iyzico, ödeme sonrası kullanıcının tarayıcısını bu adrese POST ile geri gönderir
// (form-urlencoded `token`). Bu token asla direkt güvenilmez — gerçek durum
// `retrieveCheckoutForm` ile kendi secret key'imizle server-to-server doğrulanır.
export async function POST(req: NextRequest) {
  const { origin } = req.nextUrl;
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");

  if (typeof token !== "string" || !token) {
    console.error("iyzico callback: token eksik", Object.fromEntries(form?.entries() ?? []));
    return NextResponse.redirect(new URL("/?payment=fail", origin), 303);
  }

  let result;
  try {
    result = await retrieveCheckoutForm(token);
  } catch (err) {
    console.error("iyzico callback: retrieveCheckoutForm hatası", err);
    return NextResponse.redirect(new URL("/?payment=fail", origin), 303);
  }

  console.log("iyzico callback: retrieve sonucu", {
    status: result.status,
    paymentStatus: result.paymentStatus,
    conversationId: result.conversationId,
    hasSignature: Boolean(result.signature),
  });

  const orderId = result.conversationId;
  const { data: order } = orderId
    ? await supabaseAdmin
        .from("payment_orders")
        .select("id, venue_id")
        .eq("id", orderId)
        .maybeSingle()
    : { data: null };

  if (!order) {
    console.error("iyzico callback: sipariş bulunamadı", { orderId, result });
    return NextResponse.redirect(new URL("/?payment=fail", origin), 303);
  }

  let slug: string | null = null;
  if (order.venue_id) {
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select("slug")
      .eq("id", order.venue_id)
      .maybeSingle();
    slug = venue?.slug ?? null;
  }
  const tokensPath = slug ? `/venue/${slug}/tokens` : "/";

  // İmza mevcutsa doğrulanır (hesapta imza özelliği kapalıysa alan boş gelebilir —
  // o durumda retrieve'in kendisi zaten secret key ile server-to-server doğrulanmış olur)
  const signatureOk = !result.signature || verifyCheckoutFormSignature(result);
  const success = signatureOk && result.status === "success" && result.paymentStatus === "SUCCESS";

  if (success) {
    await supabaseAdmin.rpc("confirm_payment_order", {
      p_order_id: order.id,
      p_iyzico_payment_id: result.paymentId,
      p_raw: result,
    });
    return NextResponse.redirect(new URL(`${tokensPath}?payment=success`, origin), 303);
  }

  console.error("iyzico callback: ödeme başarısız/imza uyuşmadı", {
    orderId: order.id,
    signatureOk,
    status: result.status,
    paymentStatus: result.paymentStatus,
  });

  await supabaseAdmin
    .from("payment_orders")
    .update({ status: "failed", raw_response: result })
    .eq("id", order.id)
    .eq("status", "pending");

  return NextResponse.redirect(new URL(`${tokensPath}?payment=fail`, origin), 303);
}
