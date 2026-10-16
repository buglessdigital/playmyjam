import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { getVenueUsage } from "@/lib/business-server";
import { currentMonth, monthRange } from "@/lib/business";

// Mekanın hakediş dökümleri (sözleşme md. 6.4: döküm mekan panelinden iletilir).
// Yalnızca onaylanmış ve ödenmiş kayıtlar: taslak super admin'in çalışma
// kopyasıdır, iptal edilen kayıt mekanı ilgilendirmez. İç not (notes) gönderilmez.
const COLUMNS =
  "id, period_start, tokens, unit_price, apple_tokens, apple_unit_price, gross_amount, vat_rate, vat_amount, bank_fee_pct, bank_fee, apple_fee_pct, apple_fee, other_pct, other_amount, net_amount, commission_pct, computed_amount, adjustment, adjustment_note, amount, due_date, status, paid_at, payment_ref";

export async function GET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const month = currentMonth();
  const { start, end } = monthRange(month);

  const [payouts, usage] = await Promise.all([
    supabaseAdmin
      .from("venue_payouts")
      .select(COLUMNS)
      .eq("venue_id", session.venue_id)
      .in("status", ["approved", "paid"])
      .order("period_start", { ascending: false })
      .limit(36),
    getVenueUsage(start, end).catch(() => null),
  ]);
  if (payouts.error) {
    return NextResponse.json({ error: "Hakedişler yüklenemedi" }, { status: 500 });
  }

  const u = usage?.get(session.venue_id);
  return NextResponse.json({
    payouts: payouts.data,
    // Süren ay: yalnızca jeton adedi — tutar ay kapanıp hakediş onaylanınca kesinleşir
    current: { month, paid_tokens: u?.paid_tokens ?? 0, apple_paid_tokens: u?.apple_paid_tokens ?? 0 },
  });
}
