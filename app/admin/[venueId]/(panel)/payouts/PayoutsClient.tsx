"use client";

import { useEffect, useState } from "react";
import { COMPANY } from "@/lib/company-info";
import { formatDay, formatNumber, formatTL, isOverdue, monthLabel, type PayoutStatus } from "@/lib/business";

// Mekanın aylık hakediş dökümü (Hizmet ve Gelir Paylaşım Sözleşmesi md. 5-6).
// Ücretli jeton ve kesintiler satış kanalına göre (iyzico / App Store) ayrı gösterilir.

type Payout = {
  id: string;
  period_start: string;
  tokens: number;
  unit_price: number;
  apple_tokens: number;
  apple_unit_price: number | null;
  gross_amount: number;
  vat_rate: number;
  vat_amount: number;
  bank_fee_pct: number;
  bank_fee: number;
  apple_fee_pct: number;
  apple_fee: number;
  other_pct: number;
  other_amount: number;
  net_amount: number;
  commission_pct: number;
  computed_amount: number;
  adjustment: number;
  adjustment_note: string;
  amount: number;
  due_date: string;
  status: PayoutStatus;
  paid_at: string | null;
  payment_ref: string;
};

type Data = {
  payouts: Payout[];
  current: { month: string; paid_tokens: number; apple_paid_tokens: number };
};

const n = (v: number | string | null) => Number(v ?? 0);

function StatusPill({ p }: { p: Payout }) {
  const overdue = isOverdue(p.status, p.due_date);
  const [label, color] = p.status === "paid" ? ["Ödendi", "#22c55e"] : overdue ? ["Gecikti", "#ef4444"] : ["Ödeme bekliyor", "#f59e0b"];
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: `${color}1f`, color }}>
      {label}
    </span>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className={`text-sm ${muted ? "text-[#6b7280]" : "text-[#9ca3af]"}`}>{label}</span>
      <span className={`text-sm tabular-nums text-right ${strong ? "text-white font-semibold" : "text-[#d1d5db]"}`}>{value}</span>
    </div>
  );
}

function Breakdown({ p }: { p: Payout }) {
  const apple = n(p.apple_tokens);
  const web = n(p.tokens) - apple;
  const invoiceVat = Math.round(n(p.amount) * n(p.vat_rate)) / 100;
  return (
    <div className="px-5 pb-5">
      <div className="rounded-xl border border-white/10 p-4" style={{ background: "rgba(0,0,0,0.15)" }}>
        <Line label={`Web / Android (iyzico) · ${formatNumber(web)} jeton × ${formatTL(n(p.unit_price))}`} value={formatTL(web * n(p.unit_price))} muted />
        {apple > 0 && (
          <Line
            label={`iOS (App Store) · ${formatNumber(apple)} jeton × ${formatTL(n(p.apple_unit_price ?? p.unit_price))}`}
            value={formatTL(apple * n(p.apple_unit_price ?? p.unit_price))}
            muted
          />
        )}
        <Line label="Brüt ciro (KDV dahil)" value={formatTL(n(p.gross_amount))} />
        <Line label={`KDV (%${formatNumber(n(p.vat_rate))})`} value={`− ${formatTL(n(p.vat_amount))}`} />
        <Line label={`iyzico komisyonu (%${formatNumber(n(p.bank_fee_pct))}, iyzico cirosundan)`} value={`− ${formatTL(n(p.bank_fee))}`} />
        {apple > 0 && (
          <Line
            label={`Apple komisyonu (%${formatNumber(n(p.apple_fee_pct))}, App Store cirosunun KDV hariç kısmından)`}
            value={`− ${formatTL(n(p.apple_fee))}`}
          />
        )}
        {n(p.other_amount) > 0 && <Line label={`Diğer yasal kesintiler (%${formatNumber(n(p.other_pct))})`} value={`− ${formatTL(n(p.other_amount))}`} />}
        <div className="border-t border-white/10 my-1" />
        <Line label="Net ciro" value={formatTL(n(p.net_amount))} />
        <Line label={`Komisyonunuz (%${formatNumber(n(p.commission_pct))})`} value={formatTL(n(p.computed_amount))} />
        {n(p.adjustment) !== 0 && (
          <Line label={`Düzeltme${p.adjustment_note ? ` — ${p.adjustment_note}` : ""}`} value={formatTL(n(p.adjustment))} />
        )}
        <div className="border-t border-white/10 my-1" />
        <Line label="Hakediş (KDV hariç)" value={formatTL(n(p.amount))} strong />
        <Line label={`Faturanıza eklenecek KDV (%${formatNumber(n(p.vat_rate))})`} value={formatTL(invoiceVat)} muted />
        <Line label="Fatura toplamı" value={formatTL(n(p.amount) + invoiceVat)} muted />
      </div>
      <p className="text-xs text-[#6b7280] mt-3">
        Vade {formatDay(p.due_date)}
        {p.paid_at && ` · Ödeme ${formatDay(p.paid_at)}`}
        {p.payment_ref && ` · Ref. ${p.payment_ref}`}
      </p>
    </div>
  );
}

export default function AdminPayoutsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/payouts")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const d = (await res.json()) as Data;
        setData(d);
        setOpen(d.payouts[0]?.id ?? null);
      })
      .catch(() => setError("Hakedişler yüklenemedi"));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-white font-bold text-2xl">Hakedişler</h1>
        <p className="text-[#6b7280] text-sm mt-1">Mekanınızda harcanan ücretli jetonlardan aylık kazancınız</p>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {!data && !error && (
        <div className="rounded-2xl border border-white/10 p-8 text-center text-[#6b7280] text-sm">Yükleniyor…</div>
      )}

      {data && (
        <>
          <div className="rounded-2xl border border-white/10 px-5 py-4 mb-6" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-[#6b7280] text-xs capitalize">{monthLabel(data.current.month)} · süren dönem</p>
            <p className="text-white font-bold text-2xl tabular-nums mt-1">{formatNumber(data.current.paid_tokens)} ücretli jeton</p>
            {data.current.apple_paid_tokens > 0 && (
              <p className="text-[#9ca3af] text-xs mt-1">
                {formatNumber(data.current.paid_tokens - data.current.apple_paid_tokens)} web / Android · {formatNumber(data.current.apple_paid_tokens)} iOS (App Store)
              </p>
            )}
            <p className="text-[#6b7280] text-xs mt-2">Tutar, ay kapandıktan sonra hesaplanıp onaylanınca burada görünür.</p>
          </div>

          {data.payouts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 p-8 text-center text-[#6b7280] text-sm">Henüz kesinleşmiş hakediş yok.</div>
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
              {data.payouts.map((p, i) => (
                <div key={p.id} style={i > 0 ? { borderTop: "1px solid rgba(255,255,255,0.06)" } : undefined}>
                  <button
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                    aria-expanded={open === p.id}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.03]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold capitalize">{monthLabel(p.period_start.slice(0, 7))}</p>
                      <p className="text-[#6b7280] text-xs mt-0.5">
                        {formatNumber(n(p.tokens))} ücretli jeton
                        {n(p.apple_tokens) > 0 && ` (${formatNumber(n(p.apple_tokens))} App Store)`}
                      </p>
                    </div>
                    <span className="text-white font-semibold tabular-nums">{formatTL(n(p.amount))}</span>
                    <StatusPill p={p} />
                  </button>
                  {open === p.id && <Breakdown p={p} />}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 px-5 py-4 mt-6 text-xs text-[#9ca3af] leading-relaxed" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-white text-sm font-semibold mb-2">Fatura bilgileri</p>
            <p>
              {COMPANY.legalName} — {COMPANY.tradeName}
              <br />
              Vergi dairesi / no: {COMPANY.taxOffice} / {COMPANY.taxNumber}
              <br />
              {COMPANY.legalAddress}
            </p>
            <p className="mt-2">
              Hakediş KDV hariçtir; faturanıza yasal KDV&apos;yi ekleyip <span className="text-white">{COMPANY.email}</span> adresine gönderin. Dökümdeki
              bir kaleme itirazınızı onaydan itibaren 15 gün içinde aynı adrese yazılı olarak iletebilirsiniz.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
