import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { getPayoutSettings, getUnitPrice, getVenueUsage, UUID_RE } from "@/lib/business-server";
import { computePayout, dueDateFor, istanbulToday, isMonthKey, monthRange } from "@/lib/business";

const PAYOUT_COLUMNS =
  "id, venue_id, venue_name, period_start, period_end, tokens, unit_price, gross_amount, vat_rate, vat_amount, bank_fee_pct, bank_fee, other_pct, other_amount, net_amount, commission_pct, computed_amount, adjustment, adjustment_note, amount, due_date, status, paid_at, payment_ref, notes, created_at, updated_at";

// Seçilen ayın hakediş tablosu: her mekan için kullanım, güncel oranlarla önizleme
// ve (varsa) kayıtlı hakediş. Ayrıca tüm aylardaki ödenmemiş hakedişler.
export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "Geçersiz ay" }, { status: 400 });
  const { start, end } = monthRange(month);

  const [venues, contracts, payouts, open, usage, settings, unitPrice] = await Promise.all([
    supabaseAdmin.from("venues").select("id, slug, name, status").order("name"),
    supabaseAdmin.from("venue_contracts").select("venue_id, commission_pct, payment_day, start_date, end_date, iban, account_holder"),
    supabaseAdmin.from("venue_payouts").select(PAYOUT_COLUMNS).eq("period_start", start),
    supabaseAdmin
      .from("venue_payouts")
      .select(PAYOUT_COLUMNS)
      .in("status", ["draft", "approved"])
      .order("due_date"),
    getVenueUsage(start, end).catch(() => null),
    getPayoutSettings(),
    getUnitPrice(),
  ]);
  if (venues.error || contracts.error || payouts.error || open.error || !usage) {
    return NextResponse.json({ error: "Hakedişler yüklenemedi" }, { status: 500 });
  }

  const contractBy = new Map(contracts.data.map((c) => [c.venue_id, c]));
  const payoutBy = new Map(payouts.data.map((p) => [p.venue_id, p]));

  const rows = venues.data
    .filter((v) => contractBy.has(v.id) || usage.has(v.id) || payoutBy.has(v.id))
    .map((v) => {
      const contract = contractBy.get(v.id) ?? null;
      const u = usage.get(v.id) ?? { tokens: 0, paid_tokens: 0, requests: 0, last_spend_at: null };
      const preview = contract
        ? {
            ...computePayout(u.paid_tokens, unitPrice, settings, Number(contract.commission_pct)),
            due_date: dueDateFor(month, contract.payment_day),
          }
        : null;
      return { venue: v, contract, usage: u, preview, payout: payoutBy.get(v.id) ?? null };
    });

  // Mekanı silinmiş ama bu aya kaydı olan hakedişler
  const orphans = payouts.data.filter((p) => !p.venue_id);

  return NextResponse.json({
    month,
    closed: end <= istanbulToday(),
    settings,
    unit_price: unitPrice,
    rows,
    orphans,
    open: open.data,
  });
}

// Ay için taslak hakediş oluşturur / taslakları günceller.
// Onaylanmış, ödenmiş ya da iptal edilmiş kayıtlara dokunmaz.
export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const month = body?.month;
  if (!isMonthKey(month)) return NextResponse.json({ error: "Geçersiz ay" }, { status: 400 });
  const { start, end } = monthRange(month);
  if (end > istanbulToday()) {
    return NextResponse.json({ error: "Dönem henüz kapanmadı; hakediş ay bittikten sonra oluşturulur" }, { status: 400 });
  }

  let venueIds: string[] | null = null;
  if (body.venue_ids !== undefined) {
    if (!Array.isArray(body.venue_ids) || !body.venue_ids.every((id: unknown) => typeof id === "string" && UUID_RE.test(id))) {
      return NextResponse.json({ error: "Geçersiz mekan listesi" }, { status: 400 });
    }
    venueIds = body.venue_ids;
  }

  let contractQuery = supabaseAdmin
    .from("venue_contracts")
    .select("venue_id, commission_pct, payment_day, start_date, end_date, venues(name)");
  if (venueIds) contractQuery = contractQuery.in("venue_id", venueIds);

  const [contracts, existing, usage, settings, unitPrice] = await Promise.all([
    contractQuery,
    supabaseAdmin.from("venue_payouts").select("venue_id, status").eq("period_start", start),
    getVenueUsage(start, end).catch(() => null),
    getPayoutSettings(),
    getUnitPrice(),
  ]);
  if (contracts.error || existing.error || !usage) {
    return NextResponse.json({ error: "Hakediş hesaplanamadı" }, { status: 500 });
  }

  const locked = new Set(existing.data.filter((p) => p.status !== "draft").map((p) => p.venue_id));
  const now = new Date().toISOString();

  const rows = contracts.data
    // Dönemle hiç kesişmeyen sözleşmeler atlanır
    .filter((c) => !(c.start_date && c.start_date >= end) && !(c.end_date && c.end_date < start))
    .filter((c) => !locked.has(c.venue_id))
    // O ay hiç ücretli jeton harcanmayan mekana 0 TL'lik kayıt açılmaz
    .filter((c) => (usage.get(c.venue_id)?.paid_tokens ?? 0) > 0)
    .map((c) => {
      // Hakediş yalnızca parayla alınmış jetondan: bedava (grant/demo) jeton ciro değil
      const tokens = usage.get(c.venue_id)?.paid_tokens ?? 0;
      const commission = Number(c.commission_pct);
      const r = computePayout(tokens, unitPrice, settings, commission);
      const venue = c.venues as unknown as { name: string } | null;
      return {
        venue_id: c.venue_id,
        venue_name: venue?.name ?? "",
        period_start: start,
        period_end: end,
        tokens,
        unit_price: unitPrice,
        gross_amount: r.gross,
        vat_rate: settings.vat_rate,
        vat_amount: r.vat,
        bank_fee_pct: settings.bank_fee_pct,
        bank_fee: r.bankFee,
        other_pct: settings.other_pct,
        other_amount: r.other,
        net_amount: r.net,
        commission_pct: commission,
        computed_amount: r.computed,
        due_date: dueDateFor(month, c.payment_day),
        status: "draft",
        updated_at: now,
      };
    });

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from("venue_payouts").upsert(rows, { onConflict: "venue_id,period_start" });
    if (error) return NextResponse.json({ error: "Hakedişler kaydedilemedi" }, { status: 500 });
  }

  return NextResponse.json({ created: rows.length, skipped_locked: locked.size });
}
