import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { getPayoutSettings, getUnitPrice, getVenueUsage } from "@/lib/business-server";
import {
  computePayout,
  currentMonth,
  istanbulToday,
  monthRange,
  OPEN_STAGES,
  shiftMonth,
  type LeadStage,
} from "@/lib/business";

const DAY = 86400000;
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// Süper admin ana ekranının iş özeti: ciro, hakediş, görevler, hat, mekan sağlığı
export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const today = istanbulToday();
  const tomorrow = addDays(today, 1);
  const month = currentMonth();
  const { start: monthStart } = monthRange(month);
  const { start: prevStart } = monthRange(shiftMonth(month, -1));
  // Geçen ayın aynı gününe kadar — "ayın bu noktasında geçen ay neredeydik"
  const prevSameDay = addDays(prevStart, Math.min(Number(today.slice(8, 10)), 28));

  const [
    usageMonth,
    usagePrevPartial,
    usage30,
    usagePrev30,
    salesMonth,
    salesPrev,
    venues,
    contracts,
    openPayouts,
    tasks,
    leads,
    settings,
    unitPrice,
  ] = await Promise.all([
    getVenueUsage(monthStart, tomorrow),
    getVenueUsage(prevStart, prevSameDay),
    getVenueUsage(addDays(today, -29), tomorrow),
    getVenueUsage(addDays(today, -59), addDays(today, -29)),
    supabaseAdmin.rpc("token_sales_total", { p_from: monthStart, p_to: tomorrow }).single(),
    supabaseAdmin.rpc("token_sales_total", { p_from: prevStart, p_to: prevSameDay }).single(),
    supabaseAdmin.from("venues").select("id, slug, name, status"),
    supabaseAdmin.from("venue_contracts").select("venue_id, commission_pct, iban"),
    supabaseAdmin
      .from("venue_payouts")
      .select("id, venue_id, venue_name, period_start, amount, due_date, status")
      .in("status", ["draft", "approved"])
      .order("due_date"),
    supabaseAdmin
      .from("crm_tasks")
      .select("id, title, due_at, priority, lead_id, venue_id, crm_leads(id, name), venues(id, name)")
      .eq("done", false)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200),
    supabaseAdmin.from("crm_leads").select("id, name, stage, next_action, next_action_at, updated_at, city"),
    getPayoutSettings(),
    getUnitPrice(),
  ]).catch(() => [] as never[]);

  if (!venues || venues.error || contracts.error || openPayouts.error || tasks.error || leads.error) {
    return NextResponse.json({ error: "Özet yüklenemedi" }, { status: 500 });
  }

  const sum = (m: Map<string, { tokens: number }>) => [...m.values()].reduce((a, u) => a + u.tokens, 0);
  const contractBy = new Map(contracts.data.map((c) => [c.venue_id, c]));

  // Bu ay oluşan tahmini mekan hakedişi (güncel oranlarla)
  let payoutEstimate = 0;
  for (const [venueId, u] of usageMonth) {
    const c = contractBy.get(venueId);
    if (c) payoutEstimate += computePayout(u.paid_tokens, unitPrice, settings, Number(c.commission_pct)).computed;
  }

  const tokensMonth = sum(usageMonth);
  const paidTokensMonth = [...usageMonth.values()].reduce((a, u) => a + u.paid_tokens, 0);
  const sales = salesMonth.data as { orders: number; tokens: number; total: number } | null;
  const salesPrevData = salesPrev.data as { orders: number; tokens: number; total: number } | null;

  // Ödemeler
  const overdue = openPayouts.data.filter((p) => p.due_date < today);
  const approved = openPayouts.data.filter((p) => p.status === "approved");
  const upcoming = openPayouts.data.filter((p) => p.due_date >= today && p.due_date <= addDays(today, 7));
  const total = (rows: { amount: number }[]) => rows.reduce((a, p) => a + Number(p.amount), 0);

  // Görevler
  const endOfToday = new Date(Date.parse(`${tomorrow}T00:00:00+03:00`)).toISOString();
  const nowIso = new Date().toISOString();
  const overdueTasks = tasks.data.filter((t) => t.due_at && t.due_at < nowIso);
  const todayTasks = tasks.data.filter((t) => t.due_at && t.due_at >= nowIso && t.due_at < endOfToday);

  // Hat
  const stageCounts: Record<string, number> = {};
  for (const l of leads.data) stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;
  const openLeads = leads.data.filter((l) => OPEN_STAGES.includes(l.stage as LeadStage));
  const dueFollowUps = openLeads
    .filter((l) => l.next_action_at && l.next_action_at < endOfToday)
    .sort((a, b) => (a.next_action_at! < b.next_action_at! ? -1 : 1))
    .slice(0, 8);
  const staleCutoff = new Date(Date.now() - 14 * DAY).toISOString();
  const staleLeads = openLeads
    .filter((l) => l.updated_at < staleCutoff && !l.next_action_at)
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))
    .slice(0, 8);
  const decided = (stageCounts.won ?? 0) + (stageCounts.lost ?? 0);

  // Mekan sağlığı: aktif mekanlarda son 30 gün, önceki 30 güne göre sert düşüş ya da hiç kullanım yok
  const activeVenues = venues.data.filter((v) => v.status === "active");
  const health = activeVenues
    .map((v) => {
      const now30 = usage30.get(v.id)?.tokens ?? 0;
      const prev30 = usagePrev30.get(v.id)?.tokens ?? 0;
      return {
        venue: v,
        tokens30: now30,
        prev30,
        last_spend_at: usage30.get(v.id)?.last_spend_at ?? usagePrev30.get(v.id)?.last_spend_at ?? null,
        change: prev30 > 0 ? (now30 - prev30) / prev30 : null,
      };
    })
    .filter((h) => (h.prev30 >= 10 && h.change !== null && h.change <= -0.4) || (h.tokens30 === 0 && h.prev30 > 0))
    .sort((a, b) => (a.change ?? 0) - (b.change ?? 0))
    .slice(0, 8);

  const topVenues = [...usageMonth.entries()]
    .map(([id, u]) => ({ venue: venues.data.find((v) => v.id === id), tokens: u.tokens, requests: u.requests }))
    .filter((r) => r.venue)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);

  const missingContract = activeVenues.filter((v) => !contractBy.has(v.id));
  const missingIban = activeVenues.filter((v) => {
    const c = contractBy.get(v.id);
    return c && !c.iban;
  });

  return NextResponse.json({
    month,
    revenue: {
      tokens_used: tokensMonth,
      tokens_used_prev: sum(usagePrevPartial),
      usage_value: Math.round(paidTokensMonth * unitPrice * 100) / 100,
      sales_total: Number(sales?.total ?? 0),
      sales_orders: Number(sales?.orders ?? 0),
      sales_total_prev: Number(salesPrevData?.total ?? 0),
      payout_estimate: Math.round(payoutEstimate * 100) / 100,
    },
    payouts: {
      open_count: openPayouts.data.length,
      open_total: total(openPayouts.data),
      approved_total: total(approved),
      overdue_count: overdue.length,
      overdue_total: total(overdue),
      upcoming,
      overdue,
    },
    tasks: {
      open_count: tasks.data.length,
      overdue_count: overdueTasks.length,
      today_count: todayTasks.length,
      list: [...overdueTasks, ...todayTasks].slice(0, 8),
    },
    pipeline: {
      stage_counts: stageCounts,
      open_count: openLeads.length,
      win_rate: decided > 0 ? (stageCounts.won ?? 0) / decided : null,
      due_follow_ups: dueFollowUps,
      stale: staleLeads,
    },
    health,
    top_venues: topVenues,
    gaps: {
      missing_contract: missingContract,
      missing_iban: missingIban,
    },
  });
}
