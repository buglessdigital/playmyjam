"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  OPEN_STAGES,
  STAGE_META,
  formatDateTime,
  formatDay,
  formatNumber,
  formatTL,
  monthLabel,
} from "@/lib/business";
import { ACCENT, Card, Stat, api, useNow } from "./ui";

type VenueRef = { id: string; slug: string; name: string };
type PayoutRef = { id: string; venue_name: string; period_start: string; amount: number; due_date: string; status: string };
type TaskRef = { id: string; title: string; due_at: string | null; crm_leads: { id: string; name: string } | null; venues: { id: string; name: string } | null };
type LeadRef = { id: string; name: string; stage: string; next_action: string; next_action_at: string | null; updated_at: string; city: string };

type Overview = {
  month: string;
  revenue: {
    tokens_used: number;
    tokens_used_prev: number;
    usage_value: number;
    sales_total: number;
    sales_orders: number;
    sales_total_prev: number;
    payout_estimate: number;
  };
  payouts: {
    open_count: number;
    open_total: number;
    approved_total: number;
    overdue_count: number;
    overdue_total: number;
    upcoming: PayoutRef[];
    overdue: PayoutRef[];
  };
  tasks: { open_count: number; overdue_count: number; today_count: number; list: TaskRef[] };
  pipeline: { stage_counts: Record<string, number>; open_count: number; win_rate: number | null; due_follow_ups: LeadRef[]; stale: LeadRef[] };
  health: { venue: VenueRef; tokens30: number; prev30: number; last_spend_at: string | null; change: number | null }[];
  top_venues: { venue: VenueRef; tokens: number; requests: number }[];
  gaps: { missing_contract: VenueRef[]; missing_iban: VenueRef[] };
};

function change(now: number, prev: number) {
  if (prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% geçen aya göre`;
}

function Panel({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">{title}</h3>
        <Link href={href} className="text-xs font-medium" style={{ color: ACCENT }}>
          {linkLabel} →
        </Link>
      </div>
      {children}
    </Card>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[#6b7280]">{children}</p>;
}

export default function BusinessOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useNow();

  useEffect(() => {
    api<Overview>("/api/super-admin/overview")
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <p className="mb-10 text-xs text-[#6b7280]">
        İş özeti yüklenemedi (0050 migration’ı uygulandı mı?).
      </p>
    );
  }
  if (!data) return <div className="mb-10 h-40 rounded-2xl border border-white/10 animate-pulse" style={{ background: "rgba(255,255,255,0.02)" }} />;

  const { revenue, payouts, tasks, pipeline } = data;

  return (
    <div className="mb-10 flex flex-col gap-5">
      <div>
        <h2 className="text-white font-semibold text-base mb-3 capitalize">{monthLabel(data.month)} özeti</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Jeton satışı (tahsilat)" value={formatTL(revenue.sales_total)} sub={change(revenue.sales_total, revenue.sales_total_prev) ?? `${revenue.sales_orders} ödeme`} />
          <Stat label="Harcanan jeton" value={formatNumber(revenue.tokens_used)} sub={change(revenue.tokens_used, revenue.tokens_used_prev) ?? `≈ ${formatTL(revenue.usage_value)} ciro`} />
          <Stat label="Oluşan mekan hakedişi" value={formatTL(revenue.payout_estimate)} sub="bu ay, tahmini" tone="warn" />
          <Stat
            label="Ödenmemiş hakediş"
            value={formatTL(payouts.open_total)}
            sub={payouts.overdue_count > 0 ? `${payouts.overdue_count} gecikmiş · ${formatTL(payouts.overdue_total)}` : `${payouts.open_count} kayıt`}
            tone={payouts.overdue_count > 0 ? "danger" : undefined}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={`Görevler · ${tasks.open_count} açık`} href="/super-admin/tasks" linkLabel="Tümü">
          {tasks.list.length === 0 ? (
            <Muted>Bugün için ya da gecikmiş görev yok</Muted>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {tasks.list.map((t) => {
                const late = t.due_at && new Date(t.due_at).getTime() < now;
                return (
                  <li key={t.id} className="min-w-0">
                    <p className="text-sm text-[#d1d5db] truncate">{t.title}</p>
                    <p className="text-xs" style={{ color: late ? "#ef4444" : ACCENT }}>
                      {formatDateTime(t.due_at)}
                      {(t.crm_leads || t.venues) && <span className="text-[#6b7280]"> · {t.crm_leads?.name ?? t.venues?.name}</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Ödeme takvimi" href="/super-admin/payouts" linkLabel="Hakedişler">
          {payouts.overdue.length + payouts.upcoming.length === 0 ? (
            <Muted>Gecikmiş ya da 7 gün içinde vadesi gelen ödeme yok</Muted>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {[...payouts.overdue, ...payouts.upcoming].slice(0, 8).map((p) => {
                const late = payouts.overdue.includes(p);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[#d1d5db] truncate">{p.venue_name}</p>
                      <p className="text-xs" style={{ color: late ? "#ef4444" : "#9ca3af" }}>
                        {late ? "Gecikti · " : ""}vade {formatDay(p.due_date)}
                        {p.status === "draft" && <span className="text-[#6b7280]"> · onaysız</span>}
                      </p>
                    </div>
                    <span className="text-sm text-white tabular-nums shrink-0">{formatTL(Number(p.amount))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Satış hattı" href="/super-admin/crm" linkLabel="Görüşmeler">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {OPEN_STAGES.map((s) => (
              <span key={s} className="text-xs px-2 py-1 rounded-lg" style={{ background: `${STAGE_META[s].color}1a`, color: STAGE_META[s].color }}>
                {STAGE_META[s].label} {pipeline.stage_counts[s] ?? 0}
              </span>
            ))}
          </div>
          <p className="text-xs text-[#6b7280] mb-3">
            {pipeline.stage_counts.won ?? 0} kazanıldı · {pipeline.stage_counts.lost ?? 0} kaybedildi
            {pipeline.win_rate !== null && ` · %${Math.round(pipeline.win_rate * 100)} kazanma`}
          </p>
          {pipeline.due_follow_ups.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {pipeline.due_follow_ups.map((l) => (
                <li key={l.id}>
                  <Link href={`/super-admin/crm/${l.id}`} className="block min-w-0 hover:opacity-80">
                    <p className="text-sm text-[#d1d5db] truncate">{l.name}</p>
                    <p className="text-xs text-[#ef4444] truncate">
                      {l.next_action || "Takip"} · {formatDateTime(l.next_action_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>Bugün takip edilecek aday yok</Muted>
          )}
          {pipeline.stale.length > 0 && (
            <p className="text-xs text-[#f59e0b] mt-3">
              {pipeline.stale.length} aday 14+ gündür hareketsiz ve sonraki adımı yok: {pipeline.stale.slice(0, 3).map((l) => l.name).join(", ")}
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Bu ayın en çok kullanan mekanları" href="/super-admin/payouts" linkLabel="Detay">
          {data.top_venues.length === 0 ? (
            <Muted>Bu ay henüz jeton harcanmadı</Muted>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.top_venues.map((t, i) => (
                <li key={t.venue.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[#d1d5db] truncate">
                    <span className="text-[#6b7280] mr-2">{i + 1}.</span>
                    {t.venue.name}
                  </span>
                  <span className="text-white tabular-nums shrink-0">{formatNumber(t.tokens)} jeton</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Mekan sağlığı" href="/super-admin/contracts" linkLabel="Mekanlar">
          {data.health.length === 0 ? (
            <Muted>Son 30 günde kullanımı sert düşen mekan yok</Muted>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.health.map((h) => (
                <li key={h.venue.id} className="min-w-0">
                  <p className="text-sm text-[#d1d5db] truncate">{h.venue.name}</p>
                  <p className="text-xs text-[#ef4444]">
                    {h.tokens30 === 0 ? "30 gündür kullanım yok" : `%${Math.round((h.change ?? 0) * 100)} düşüş`}
                    <span className="text-[#6b7280]">
                      {" "}· {formatNumber(h.tokens30)} / önceki {formatNumber(h.prev30)} jeton
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Eksik kayıtlar" href="/super-admin/contracts" linkLabel="Sözleşmeler">
          {data.gaps.missing_contract.length + data.gaps.missing_iban.length === 0 ? (
            <Muted>Tüm aktif mekanların sözleşmesi ve IBAN’ı tam</Muted>
          ) : (
            <div className="flex flex-col gap-3">
              {data.gaps.missing_contract.length > 0 && (
                <div>
                  <p className="text-xs text-[#ef4444] mb-1">Sözleşmesi yok ({data.gaps.missing_contract.length})</p>
                  <p className="text-sm text-[#d1d5db]">{data.gaps.missing_contract.map((v) => v.name).join(", ")}</p>
                </div>
              )}
              {data.gaps.missing_iban.length > 0 && (
                <div>
                  <p className="text-xs text-[#f59e0b] mb-1">IBAN eksik ({data.gaps.missing_iban.length})</p>
                  <p className="text-sm text-[#d1d5db]">{data.gaps.missing_iban.map((v) => v.name).join(", ")}</p>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
