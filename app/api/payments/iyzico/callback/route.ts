import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { retrieveCheckoutForm, verifyCheckoutFormSignature } from "@/lib/iyzico";
import { reportIssue } from "@/lib/ops-log";

// iyzico, ödeme sonrası kullanıcının tarayıcısını bu adrese POST ile geri gönderir
// (form-urlencoded `token`). Bu token asla direkt güvenilmez — gerçek durum
// `retrieveCheckoutForm` ile kendi secret key'imizle server-to-server doğrulanır.
export async function POST(req: NextRequest) {
  const { origin } = req.nextUrl;
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");

  if (typeof token !== "string" || !token) {
    console.error("iyzico callback: token eksik", Object.fromEntries(form?.entries() ?? []));
    await reportIssue({
      area: "payment",
      kind: "callback_no_token",
      severity: "error",
      message: "iyzico dönüşünde ödeme jetonu yoktu — müşteri ödeme sonucunu göremedi",
    });
    return NextResponse.redirect(new URL("/?payment=fail", origin), 303);
  }

  let result;
  try {
    result = await retrieveCheckoutForm(token);
  } catch (err) {
    console.error("iyzico callback: retrieveCheckoutForm hatası", err);
    await reportIssue({
      area: "payment",
      kind: "retrieve_failed",
      severity: "error",
      message: "iyzico'dan ödeme sonucu sorgulanamadı — ödeme alınmış olabilir, iyzico panelinden kontrol et",
      error: err,
    });
    return NextResponse.redirect(new URL("/?payment=fail", origin), 303);
  }

  console.log("iyzico callback: retrieve sonucu", {
    status: result.status,
    paymentStatus: result.paymentStatus,
    conversationId: result.conversationId,
    hasSignature: Boolean(result.signature),
    // Kart saklama teşhisi: iyzico bu alanı Checkout Form sorgu yanıtında
    // dokümante etmiyor ama pratikte döndürüyor. Saklı kart özelliği
    // çalışmıyorsa bakılacak ilk yer burası (anahtarın adı asla loglanmaz).
    hasCardUserKey: Boolean(result.cardUserKey),
  });

  // iyzico DECLINED (başarısız) ödemelerde conversationId'yi geri döndürmüyor —
  // basketId her zaman geliyor ve biz ikisini de order.id ile aynı ayarladık (checkout route)
  const orderId = result.conversationId || result.basketId;
  const { data: order } = orderId
    ? await supabaseAdmin
        .from("payment_orders")
        .select("id, venue_id, user_id")
        .eq("id", orderId)
        .maybeSingle()
    : { data: null };

  if (!order) {
    console.error("iyzico callback: sipariş bulunamadı", { orderId, result });
    await reportIssue({
      area: "payment",
      kind: "order_not_found",
      severity: "error",
      message: `iyzico dönüşündeki sipariş bulunamadı (${orderId ?? "kimlik yok"}) — ödeme durumu: ${result.paymentStatus ?? result.status}`,
      detail: { order_id: orderId, payment_id: result.paymentId, status: result.status, payment_status: result.paymentStatus },
    });
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
    // Kart saklama (0048): kullanıcı formda kartını saklattıysa iyzico bu ödemenin
    // yanıtında cardUserKey döndürür. Anahtarı profile yazıyoruz — bir sonraki
    // ödemede form saklı kartla açılır. Zaten anahtarı varsa dokunmuyoruz
    // (aynı cüzdana eklenen ikinci kart da o anahtarın altında listelenir).
    if (order.user_id && result.cardUserKey) {
      const { error: cardKeyError } = await supabaseAdmin
        .from("profiles")
        .update({ iyzico_card_user_key: result.cardUserKey })
        .eq("id", order.user_id)
        .is("iyzico_card_user_key", null);
      if (cardKeyError) {
        // Jeton yükleme bundan etkilenmemeli: sadece "tek tık" konforu kaybolur
        console.error("iyzico callback: cardUserKey kaydedilemedi", cardKeyError);
        await reportIssue({
          area: "payment",
          kind: "card_key_save_failed",
          severity: "warn",
          message: "Saklı kart anahtarı profile yazılamadı (jeton yüklemesi etkilenmedi)",
          venueId: order.venue_id,
          detail: { order_id: order.id },
          error: cardKeyError,
        });
      }
    }

    const { error: confirmError } = await supabaseAdmin.rpc("confirm_payment_order", {
      p_order_id: order.id,
      p_iyzico_payment_id: result.paymentId,
      p_raw: result,
    });
    if (confirmError) {
      // Para çekildi ama jeton yüklenmemiş olabilir: elle düzeltme gerektirir
      console.error("iyzico callback: confirm_payment_order hatası", confirmError);
      await reportIssue({
        area: "payment",
        kind: "confirm_failed",
        severity: "error",
        message: `Ödeme alındı ama jeton yüklenemedi — sipariş ${order.id} elle kontrol edilmeli`,
        venueId: order.venue_id,
        detail: { order_id: order.id, payment_id: result.paymentId, user_id: order.user_id },
        error: confirmError,
      });
    }
    return NextResponse.redirect(new URL(`${tokensPath}?payment=success`, origin), 303);
  }

  console.error("iyzico callback: ödeme başarısız/imza uyuşmadı", {
    orderId: order.id,
    signatureOk,
    status: result.status,
    paymentStatus: result.paymentStatus,
  });

  // Kart reddi müşteri tarafı bir durum (uyarı); imza uyuşmazlığı bizim sorunumuz
  await reportIssue({
    area: "payment",
    kind: signatureOk ? "payment_declined" : "signature_mismatch",
    severity: signatureOk ? "warn" : "error",
    message: signatureOk
      ? `Ödeme başarısız: ${result.errorMessage ?? result.paymentStatus ?? result.status}`
      : "iyzico yanıt imzası doğrulanamadı — ödeme reddedildi sayıldı",
    venueId: order.venue_id,
    detail: { order_id: order.id, status: result.status, payment_status: result.paymentStatus, error_code: result.errorCode },
  });

  await supabaseAdmin
    .from("payment_orders")
    .update({ status: "failed", raw_response: result })
    .eq("id", order.id)
    .eq("status", "pending");

  return NextResponse.redirect(new URL(`${tokensPath}?payment=fail`, origin), 303);
}
