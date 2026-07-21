import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCheckoutForm } from "@/lib/iyzico";

const MAX_LOOSE = 1000;

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

  // Fiyat/tutar asla client'tan alınmaz: ya paket id'si (fiyat DB satırından)
  // ya da tekli adet (fiyat = adet × app_settings'teki birim fiyat) gelir.
  const body = await req.json().catch(() => null);
  const packageId = typeof body?.package_id === "string" ? body.package_id : "";
  const looseTokens = body?.tokens;
  if ((packageId && looseTokens !== undefined) || (!packageId && looseTokens === undefined)) {
    return NextResponse.json({ error: "Paket veya jeton adedi seçilmeli" }, { status: 400 });
  }

  // iyzico Checkout Form'un zorunlu tuttuğu alıcı bilgisi — sitede sadece e-posta
  // toplandığı için ödeme anında kısa bir formla alınıyor.
  const buyerName = typeof body?.buyer?.name === "string" ? body.buyer.name.trim() : "";
  const buyerSurname = typeof body?.buyer?.surname === "string" ? body.buyer.surname.trim() : "";
  const buyerIdentity = typeof body?.buyer?.identityNumber === "string" ? body.buyer.identityNumber.trim() : "";
  const buyerCity = typeof body?.buyer?.city === "string" ? body.buyer.city.trim() : "";
  if (!buyerName || !buyerSurname || !buyerCity) {
    return NextResponse.json({ error: "Ad, soyad ve şehir gerekli" }, { status: 400 });
  }
  if (!/^[1-9][0-9]{10}$/.test(buyerIdentity)) {
    return NextResponse.json({ error: "Geçerli bir T.C. kimlik numarası gir" }, { status: 400 });
  }

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id, slug")
    .eq("slug", venueId)
    .single();
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  let amount: number;
  let total: number;
  let resolvedPackageId: string | null = null;

  if (packageId) {
    const { data: pkg } = await supabaseAdmin
      .from("global_token_packages")
      .select("id, tokens, price")
      .eq("id", packageId)
      .single();
    if (!pkg) {
      return NextResponse.json({ error: "Paket bulunamadı" }, { status: 404 });
    }
    amount = pkg.tokens;
    total = Number(pkg.price);
    resolvedPackageId = pkg.id;
  } else {
    const qty = Number(looseTokens);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LOOSE) {
      return NextResponse.json({ error: `Jeton adedi 1-${MAX_LOOSE} arası tam sayı olmalı` }, { status: 400 });
    }
    // Para hesabı: birim fiyat cache'ten değil doğrudan DB'den okunur
    const { data: setting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "token_unit_price")
      .maybeSingle();
    const unitPrice = Number(setting?.value);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return NextResponse.json({ error: "Fiyat bilgisi alınamadı" }, { status: 500 });
    }
    amount = qty;
    total = qty * unitPrice;
  }

  // Sipariş: jeton yalnızca iyzico callback'i doğrulandığında eklenir (bkz. 0017 migration)
  const { data: order, error: orderError } = await supabaseAdmin
    .from("payment_orders")
    .insert({
      user_id: userId,
      venue_id: venue.id,
      tokens: amount,
      total,
      buyer: { name: buyerName, surname: buyerSurname, identityNumber: buyerIdentity, city: buyerCity },
    })
    .select("id")
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Sipariş oluşturulamadı" }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "85.34.78.112";
  const registrationAddress = `${buyerCity} - dijital ürün (fiziksel teslimat yok)`;
  const priceStr = total.toFixed(2);

  try {
    const result = await createCheckoutForm({
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
          id: resolvedPackageId ?? "custom-tokens",
          name: `${amount} Jeton`,
          category1: "Dijital Jeton",
          itemType: "VIRTUAL",
          price: priceStr,
        },
      ],
    });

    if (result.status !== "success" || !result.paymentPageUrl) {
      await supabaseAdmin
        .from("payment_orders")
        .update({ status: "failed", raw_response: result })
        .eq("id", order.id);
      return NextResponse.json({ error: result.errorMessage ?? "Ödeme başlatılamadı" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, paymentPageUrl: result.paymentPageUrl });
  } catch {
    await supabaseAdmin.from("payment_orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Ödeme başlatılamadı" }, { status: 502 });
  }
}
