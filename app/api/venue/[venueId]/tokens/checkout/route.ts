import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCheckoutForm, type CheckoutFormInitializeRequest } from "@/lib/iyzico";
import { hasVenueSession } from "@/lib/venue-auth-cookie";

const MAX_TOKENS = 1000;
// iyzico şemasında zorunlu ama doğrulanmayan alanlar için yer tutucular
const PLACEHOLDER_IDENTITY = "11111111111";
const PLACEHOLDER_CITY = "İstanbul";
const BUYER_SURNAME = "Kullanıcı";
const BUYER_FALLBACK_NAME = "PlayMyJam";

/**
 * iyzico'ya gidecek alıcı adı: profil kullanıcı adı, yoksa e-postanın yerel kısmı.
 * iyzico ad alanında yalnızca harf/rakam/boşluk kabul ettiği için temizleniyor.
 */
function buyerNameFrom(username: string | null | undefined, email: string | undefined) {
  const raw = (username || email?.split("@")[0] || "").replace(/[^\p{L}\p{N} ]/gu, " ").trim();
  return raw ? raw.slice(0, 40) : BUYER_FALLBACK_NAME;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  const supabase = await createClient();
  // getClaims: JWT'yi yerelde doğrular — Auth sunucusuna gitmez
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  const email = claimsData?.claims.email;
  if (!userId) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }
  if (!hasVenueSession(req, venueId, userId)) {
    return NextResponse.json({ error: "Bu mekana giriş yapmalısın" }, { status: 403 });
  }

  // Fiyat/tutar asla client'tan alınmaz: paket id'si + adet gelir, birim fiyatlar
  // DB satırından okunur (toplam = paket fiyatı × adet). package_id yoksa tekli
  // jeton satışıdır: birim fiyat app_settings'ten okunur.
  const body = await req.json().catch(() => null);
  const packageId = typeof body?.package_id === "string" ? body.package_id : "";
  const quantity = body?.quantity === undefined ? 1 : Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "Adet pozitif tam sayı olmalı" }, { status: 400 });
  }

  // Alıcı bilgisi kullanıcıya sorulmuyor: iyzico buyer objesinde zorunlu olan alanlar
  // hesaptan türetiliyor (kullanıcı adı / e-posta), doğrulanmayanlar yer tutucu.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username, iyzico_card_user_key")
    .eq("id", userId)
    .maybeSingle();
  const buyerName = buyerNameFrom(profile?.username, email);
  const buyerSurname = BUYER_SURNAME;
  const buyerIdentity = PLACEHOLDER_IDENTITY;
  const buyerCity = PLACEHOLDER_CITY;

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id, slug")
    .eq("slug", venueId)
    .single();
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  // Para hesabı cache'ten değil doğrudan DB satırından
  let amount: number;
  let total: number;
  let resolvedPackageId: string;

  if (packageId) {
    const { data: pkg } = await supabaseAdmin
      .from("global_token_packages")
      .select("id, tokens, price")
      .eq("id", packageId)
      .single();
    if (!pkg) {
      return NextResponse.json({ error: "Paket bulunamadı" }, { status: 404 });
    }
    amount = pkg.tokens * quantity;
    total = Number(pkg.price) * quantity;
    resolvedPackageId = pkg.id;
  } else {
    const { data: setting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "token_unit_price")
      .maybeSingle();
    const unitPrice = Number(setting?.value);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return NextResponse.json({ error: "Jeton fiyatı bulunamadı" }, { status: 500 });
    }
    amount = quantity;
    total = unitPrice * quantity;
    resolvedPackageId = "single-token";
  }

  if (amount > MAX_TOKENS) {
    return NextResponse.json({ error: `Tek seferde en fazla ${MAX_TOKENS} jeton alınabilir` }, { status: 400 });
  }

  // Sipariş: jeton yalnızca iyzico callback'i doğrulandığında eklenir (bkz. 0017 migration)
  const { data: order, error: orderError } = await supabaseAdmin
    .from("payment_orders")
    .insert({
      user_id: userId,
      venue_id: venue.id,
      tokens: amount,
      total,
      buyer: { name: buyerName, surname: buyerSurname },
    })
    .select("id")
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Sipariş oluşturulamadı" }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "85.34.78.112";
  const registrationAddress = "Dijital ürün - fiziksel teslimat yok";
  const priceStr = total.toFixed(2);

  // Kart saklama (0048): daha önce kartını saklatmış kullanıcının anahtarı
  // gönderilirse ödeme formu saklı kartlarla açılır (müşteri sadece CVC girer).
  const cardUserKey = profile?.iyzico_card_user_key || undefined;

  try {
    const request = {
      conversationId: order.id,
      price: priceStr,
      paidPrice: priceStr,
      currency: "TRY",
      basketId: order.id,
      paymentGroup: "PRODUCT",
      callbackUrl: `${new URL(req.url).origin}/api/payments/iyzico/callback`,
      buyer: {
        id: userId,
        name: buyerName,
        surname: buyerSurname,
        email: email || "no-reply@playmyjam.com.tr",
        identityNumber: buyerIdentity,
        registrationAddress,
        ip,
        city: buyerCity,
        country: "Turkey",
      },
      shippingAddress: {
        contactName: `${buyerName} ${buyerSurname}`,
        city: buyerCity,
        country: "Turkey",
        address: registrationAddress,
      },
      billingAddress: {
        contactName: `${buyerName} ${buyerSurname}`,
        city: buyerCity,
        country: "Turkey",
        address: registrationAddress,
      },
      basketItems: [
        {
          id: resolvedPackageId,
          name: `${amount} Jeton`,
          category1: "Dijital Jeton",
          itemType: "VIRTUAL",
          price: priceStr,
        },
      ],
    } satisfies CheckoutFormInitializeRequest;

    let result = await createCheckoutForm(cardUserKey ? { ...request, cardUserKey } : request);

    // Saklı kart anahtarı iyzico tarafında silinmiş/geçersiz hale gelmişse
    // initialize hiç başlamaz. Müşteri "ödeme başlatılamadı" duvarına çarpmasın:
    // anahtarı profilden düşürüp bir kez de anahtarsız deniyoruz. En kötü durumda
    // kartını yeniden saklatır.
    if (result.status !== "success" && cardUserKey) {
      console.error("iyzico checkout: cardUserKey ile başlatılamadı, anahtar düşürülüyor", {
        orderId: order.id,
        errorMessage: result.errorMessage,
      });
      await supabaseAdmin
        .from("profiles")
        .update({ iyzico_card_user_key: null })
        .eq("id", userId);
      result = await createCheckoutForm(request);
    }

    if (result.status !== "success" || !result.paymentPageUrl) {
      await supabaseAdmin
        .from("payment_orders")
        .update({ status: "failed", raw_response: result })
        .eq("id", order.id);
      return NextResponse.json({ error: result.errorMessage ?? "Ödeme başlatılamadı" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, paymentPageUrl: result.paymentPageUrl });
  } catch (err) {
    console.error("iyzico checkout initialize hatası:", err);
    await supabaseAdmin.from("payment_orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Ödeme başlatılamadı" }, { status: 502 });
  }
}
