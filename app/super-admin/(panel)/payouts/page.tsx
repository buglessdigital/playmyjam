"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import {
  PAYOUT_STATUS_META,
  currentMonth,
  formatDay,
  formatNumber,
  formatTL,
  isOverdue,
  istanbulToday,
  monthLabel,
  shiftMonth,
  type PayoutSettings,
  type PayoutStatus,
} from "@/lib/business";
import { ACCENT, Badge, Button, Card, Empty, ErrorBox, Modal, PageHeader, Stat, TextArea, TextInput, api } from "@/components/super-admin/ui";

type Payout = {
  id: string;
  venue_id: string | null;
  venue_name: string;
  period_start: string;
  period_end: string;
  tokens: number;
  unit_price: number;
  gross_amount: number;
  vat_rate: number;
  vat_amount: number;
  bank_fee_pct: number;
  bank_fee: number;
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
  notes: string;
};

type Preview = { gross: number; vat: number; bankFee: number; other: number; net: number; computed: number; due_date: string };

type Row = {
  venue: { id: string; slug: string; name: string; status: string };
  contract: { commission_pct: number; payment_day: number; iban: string; account_holder: string } | null;
  usage: { tokens: number; paid_tokens: number; requests: number };
  preview: Preview | null;
  payout: Payout | null;
};

type MonthData = {
  month: string;
  closed: boolean;
  settings: PayoutSettings;
  unit_price: number;
  rows: Row[];
  orphans: Payout[];
  open: Payout[];
};

function StatusBadge({ p }: { p: Payout }) {
  if (isOverdue(p.status, p.due_date)) return <Badge label="Gecikmiş" color="#ef4444" />;
  const m = PAYOUT_STATUS_META[p.status];
  return <Badge label={m.label} color={m.color} />;
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className={`text-sm ${muted ? "text-[#6b7280]" : "text-[#9ca3af]"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${strong ? "text-white font-semibold" : "text-[#d1d5db]"}`}>{value}</span>
    </div>
  );
}

function SettingsModal({ initial, unitPrice, onClose, onSaved }: { initial: PayoutSettings; unitPrice: number; onClose: () => void; onSaved: () => void }) {
  const [vat, setVat] = useState(String(initial.vat_rate));
  const [bank, setBank] = useState(String(initial.bank_fee_pct));
  const [other, setOther] = useState(String(initial.other_pct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 100 TL'lik örnek satışta kesintiler
  const g = 100;
  const v = g - g / (1 + Number(vat || 0) / 100);
  const net = g - v - (g * Number(bank || 0)) / 100 - (g * Number(other || 0)) / 100;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api("/api/super-admin/payout-settings", "PUT", { vat_rate: Number(vat), bank_fee_pct: Number(bank), other_pct: Number(other) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
      setSaving(false);
    }
  };

  return (
    <Modal title="Kesinti Oranları" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#9ca3af]">
          Hakediş = mekan komisyonu × (ciro − KDV − banka komisyonu − ek kesinti). Ciro = harcanan jeton × birim fiyat ({formatTL(unitPrice)}).
          Yeni oranlar yalnızca bundan sonra oluşturulan / yeniden hesaplanan taslaklara uygulanır.
        </p>
        <TextInput label="KDV (%) — fiyata dahil" type="number" step="0.01" min="0" max="100" value={vat} onChange={setVat} />
        <TextInput label="Banka / iyzico komisyonu (%) — brüt ciro üzerinden" type="number" step="0.01" min="0" max="100" value={bank} onChange={setBank} />
        <TextInput label="Ek kesinti (%) — stopaj vb., brüt ciro üzerinden" type="number" step="0.01" min="0" max="100" value={other} onChange={setOther} />
        <div className="rounded-xl border border-white/10 p-3 text-xs text-[#9ca3af]">
          Örnek: 100 TL satışta KDV {formatTL(v)}, net {formatTL(Math.max(0, net))}. %50 komisyonlu mekana {formatTL(Math.max(0, net) / 2)}.
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PayoutModal({ payout, row, onClose, onChanged }: { payout: Payout; row?: Row; onClose: () => void; onChanged: () => void }) {
  const [adjustment, setAdjustment] = useState(String(payout.adjustment));
  const [adjustmentNote, setAdjustmentNote] = useState(payout.adjustment_note);
  const [dueDate, setDueDate] = useState(payout.due_date);
  const [notes, setNotes] = useState(payout.notes);
  const [paidAt, setPaidAt] = useState(istanbulToday());
  const [paymentRef, setPaymentRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const editable = payout.status === "draft" || payout.status === "approved";
  const dirty =
    Number(adjustment) !== Number(payout.adjustment) || adjustmentNote !== payout.adjustment_note || dueDate !== payout.due_date || notes !== payout.notes;

  const run = async (body: Record<string, unknown>, close = true) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/super-admin/payouts/${payout.id}`, "PATCH", body);
      onChanged();
      if (close) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = () =>
    run(
      editable
        ? { adjustment: Number(adjustment || 0), adjustment_note: adjustmentNote, due_date: dueDate, notes }
        : { notes },
      false
    );

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/super-admin/payouts/${payout.id}`, "DELETE");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi");
      setBusy(false);
    }
  };

  const iban = row?.contract?.iban ?? "";
  const previewAmount = Number(payout.computed_amount) + Number(adjustment || 0);

  return (
    <Modal title={`${payout.venue_name} — ${monthLabel(payout.period_start.slice(0, 7))}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge p={payout} />
          <span className="text-xs text-[#6b7280]">Vade {formatDay(payout.due_date)}</span>
          {payout.paid_at && <span className="text-xs text-[#22c55e]">Ödendi {formatDay(payout.paid_at)}{payout.payment_ref && ` · ${payout.payment_ref}`}</span>}
        </div>

        <Card className="p-4">
          <Line label={`Ücretli jeton × ${formatTL(Number(payout.unit_price))}`} value={`${formatNumber(payout.tokens)} jeton`} muted />
          <Line label="Brüt ciro (KDV dahil)" value={formatTL(Number(payout.gross_amount))} />
          <Line label={`KDV (%${formatNumber(Number(payout.vat_rate))})`} value={`− ${formatTL(Number(payout.vat_amount))}`} />
          <Line label={`Banka komisyonu (%${formatNumber(Number(payout.bank_fee_pct))})`} value={`− ${formatTL(Number(payout.bank_fee))}`} />
          {Number(payout.other_pct) > 0 && (
            <Line label={`Ek kesinti (%${formatNumber(Number(payout.other_pct))})`} value={`− ${formatTL(Number(payout.other_amount))}`} />
          )}
          <div className="border-t border-white/10 my-1" />
          <Line label="Net ciro" value={formatTL(Number(payout.net_amount))} />
          <Line label={`Mekan komisyonu (%${formatNumber(Number(payout.commission_pct))})`} value={formatTL(Number(payout.computed_amount))} />
          {Number(adjustment || 0) !== 0 && <Line label="Düzeltme" value={formatTL(Number(adjustment))} />}
          <div className="border-t border-white/10 my-1" />
          <Line label="Ödenecek tutar" value={formatTL(previewAmount)} strong />
        </Card>

        {iban && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-[#6b7280]">{row?.contract?.account_holder || "IBAN"}</p>
              <p className="text-sm text-white font-mono break-all">{iban.replace(/(.{4})/g, "$1 ").trim()}</p>
            </div>
            <Button
              onClick={() => {
                navigator.clipboard?.writeText(iban).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Kopyalandı" : "Kopyala"}
            </Button>
          </div>
        )}

        {editable && (
          <div className="grid gap-3 sm:grid-cols-[140px_1fr_160px]">
            <TextInput label="Düzeltme (TL, ±)" type="number" step="0.01" value={adjustment} onChange={setAdjustment} />
            <TextInput label="Düzeltme açıklaması" value={adjustmentNote} onChange={setAdjustmentNote} maxLength={500} placeholder="Ör. eylül eksik ödemesi" />
            <TextInput label="Vade" type="date" value={dueDate} onChange={setDueDate} />
          </div>
        )}
        <TextArea label="Not" value={notes} onChange={setNotes} rows={2} maxLength={2000} />
        {dirty && (
          <div className="flex justify-end">
            <Button variant="accent" onClick={saveEdits} disabled={busy}>
              Değişiklikleri Kaydet
            </Button>
          </div>
        )}

        {payout.status === "approved" && (
          <Card className="p-4">
            <p className="text-white text-sm font-semibold mb-3">Ödemeyi kaydet</p>
            <div className="grid gap-3 sm:grid-cols-[170px_1fr_auto] items-end">
              <TextInput label="Ödeme tarihi" type="date" value={paidAt} onChange={setPaidAt} />
              <TextInput label="Dekont / referans no" value={paymentRef} onChange={setPaymentRef} maxLength={120} />
              <Button variant="success" disabled={busy || dirty} onClick={() => run({ action: "pay", paid_at: paidAt, payment_ref: paymentRef })}>
                Ödendi İşaretle
              </Button>
            </div>
            {dirty && <p className="text-xs text-[#f59e0b] mt-2">Önce değişiklikleri kaydet</p>}
          </Card>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex flex-wrap justify-end gap-2">
          {(payout.status === "draft" || payout.status === "cancelled") && (
            <Button variant="danger" onClick={remove} disabled={busy}>
              Sil
            </Button>
          )}
          {(payout.status === "draft" || payout.status === "approved") && (
            <Button variant="danger" onClick={() => run({ action: "cancel" })} disabled={busy}>
              İptal Et
            </Button>
          )}
          {payout.status === "cancelled" && (
            <Button onClick={() => run({ action: "reopen" })} disabled={busy}>
              Taslağa Al
            </Button>
          )}
          {payout.status === "approved" && (
            <Button onClick={() => run({ action: "unapprove" })} disabled={busy}>
              Onayı Geri Al
            </Button>
          )}
          {payout.status === "paid" && (
            <Button onClick={() => run({ action: "unpay" })} disabled={busy}>
              Ödemeyi Geri Al
            </Button>
          )}
          {payout.status === "draft" && (
            <Button variant="primary" onClick={() => run({ action: "approve" })} disabled={busy || dirty}>
              Onayla
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(data: MonthData) {
  const header = ["Mekan", "Dönem", "Ücretli jeton", "Brüt ciro", "KDV", "Banka kom.", "Ek kesinti", "Net ciro", "Komisyon %", "Hakediş", "Düzeltme", "Ödenecek", "Vade", "Durum", "Ödeme tarihi", "Referans", "IBAN", "Hesap sahibi"];
  const n = (x: number) => Number(x).toFixed(2).replace(".", ",");
  const lines = data.rows
    .filter((r) => r.payout)
    .map((r) => {
      const p = r.payout!;
      return [
        p.venue_name, data.month, p.tokens, n(p.gross_amount), n(p.vat_amount), n(p.bank_fee), n(p.other_amount), n(p.net_amount),
        n(p.commission_pct), n(p.computed_amount), n(p.adjustment), n(p.amount), p.due_date, PAYOUT_STATUS_META[p.status].label,
        p.paid_at ?? "", p.payment_ref, r.contract?.iban ?? "", r.contract?.account_holder ?? "",
      ].map(csvCell).join(";");
    });
  // Excel'in Türkçe karakterleri doğru açması için BOM
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hakedis-${data.month}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PayoutsPage() {
  return (
    <Suspense>
      <PayoutsPageContent />
    </Suspense>
  );
}

function PayoutsPageContent() {
  // Varsayılan: kapanmış son ay — hakediş işi genelde onun üstünde yapılır
  const [month, setMonth] = useState(() => shiftMonth(currentMonth(), -1));
  const [data, setData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    api<MonthData>(`/api/super-admin/payouts?month=${month}`)
      .then((d) => {
        setData(d);
        setLoadError("");
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Yüklenemedi"))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(load, [load]);

  const changeMonth = (m: string) => {
    setLoading(true);
    setMonth(m);
  };

  const generate = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api("/api/super-admin/payouts", "POST", { month });
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  const approveAll = async () => {
    if (!data) return;
    setBusy(true);
    setActionError("");
    const drafts = data.rows.filter((r) => r.payout?.status === "draft");
    const results = await Promise.allSettled(drafts.map((r) => api(`/api/super-admin/payouts/${r.payout!.id}`, "PATCH", { action: "approve" })));
    if (results.some((r) => r.status === "rejected")) setActionError("Bazı taslaklar onaylanamadı");
    load();
    setBusy(false);
  };

  const rows = data?.rows ?? [];
  const withPayout = rows.filter((r) => r.payout && r.payout.status !== "cancelled");
  const sumOf = (fn: (r: Row) => number) => rows.reduce((a, r) => a + fn(r), 0);
  // Kayıtlı hakediş varsa onun kopyası, yoksa güncel oranlarla önizleme
  const valueOf = (r: Row, key: "gross" | "net" | "computed") => {
    if (r.payout && r.payout.status !== "cancelled") {
      return Number(key === "gross" ? r.payout.gross_amount : key === "net" ? r.payout.net_amount : r.payout.amount);
    }
    if (r.payout) return 0;
    return r.preview?.[key] ?? 0;
  };
  const tokens = sumOf((r) => r.usage.paid_tokens);
  const freeTokens = sumOf((r) => r.usage.tokens - r.usage.paid_tokens);
  const gross = sumOf((r) => valueOf(r, "gross"));
  const net = sumOf((r) => valueOf(r, "net"));
  const payable = sumOf((r) => valueOf(r, "computed"));
  const paid = withPayout.filter((r) => r.payout!.status === "paid").reduce((a, r) => a + Number(r.payout!.amount), 0);
  const missingDrafts = rows.filter((r) => r.contract && r.usage.paid_tokens > 0 && (!r.payout || r.payout.status === "draft")).length;
  const draftCount = rows.filter((r) => r.payout?.status === "draft").length;
  const noContract = rows.filter((r) => !r.contract && r.usage.paid_tokens > 0);

  const selectedPayout =
    rows.find((r) => r.payout?.id === selected)?.payout ?? data?.open.find((p) => p.id === selected) ?? data?.orphans.find((p) => p.id === selected) ?? null;
  const selectedRow = rows.find((r) => r.payout?.id === selected);

  const today = istanbulToday();
  const openOther = (data?.open ?? []).filter((p) => p.period_start.slice(0, 7) !== month);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Hakedişler"
        subtitle="Mekanlarda harcanan jetondan mekana ödenecek aylık tutarlar"
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setSettingsOpen(true)}>Kesinti Oranları</Button>
            {data && withPayout.length > 0 && <Button onClick={() => downloadCsv(data)}>CSV İndir</Button>}
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-5">
        <Button onClick={() => changeMonth(shiftMonth(month, -1))}>‹</Button>
        <span className="text-white font-semibold text-base min-w-[140px] text-center capitalize">{monthLabel(month)}</span>
        <Button onClick={() => changeMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()}>
          ›
        </Button>
        {data && !data.closed && <Badge label="Dönem devam ediyor — tahmini" color={ACCENT} />}
      </div>

      {loadError ? (
        <ErrorBox>{loadError}</ErrorBox>
      ) : loading || !data ? (
        <p className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Stat label="Ücretli jeton" value={formatNumber(tokens)} sub={freeTokens > 0 ? `+${formatNumber(freeTokens)} bedava, hesaba girmez` : undefined} />
            <Stat label="Brüt ciro" value={formatTL(gross)} sub="KDV dahil" />
            <Stat label="Net ciro" value={formatTL(net)} sub="kesintiler sonrası" />
            <Stat label="Mekanlara hakediş" value={formatTL(payable)} tone="warn" />
            <Stat label="Ödenen" value={formatTL(paid)} sub={`${formatTL(Math.max(0, payable - paid))} kalan`} tone="good" />
          </div>

          <p className="text-xs text-[#6b7280] mb-4">
            Güncel oranlar: birim {formatTL(data.unit_price)} · KDV %{formatNumber(data.settings.vat_rate)} · banka %{formatNumber(data.settings.bank_fee_pct)}
            {data.settings.other_pct > 0 && ` · ek kesinti %${formatNumber(data.settings.other_pct)}`}
            {data.settings.bank_fee_pct === 0 && <span className="text-[#f59e0b]"> — banka komisyonu henüz girilmemiş</span>}
          </p>

          {data.closed && (missingDrafts > 0 || draftCount > 0) && (
            <Card className="p-4 mb-5 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.06)" }}>
              <p className="text-sm text-[#d1d5db]">
                {missingDrafts > draftCount
                  ? `${missingDrafts - draftCount} mekan için hakediş taslağı henüz oluşturulmadı.`
                  : `${draftCount} taslak onay bekliyor.`}{" "}
                <span className="text-[#6b7280]">Taslaklar güncel oranlarla yeniden hesaplanır; onaylı kayıtlara dokunulmaz.</span>
              </p>
              <div className="flex gap-2">
                <Button variant="accent" onClick={generate} disabled={busy}>
                  {draftCount > 0 ? "Taslakları Yeniden Hesapla" : "Taslakları Oluştur"}
                </Button>
                {draftCount > 0 && (
                  <Button variant="primary" onClick={approveAll} disabled={busy}>
                    Tümünü Onayla ({draftCount})
                  </Button>
                )}
              </div>
            </Card>
          )}
          {actionError && <div className="mb-4"><ErrorBox>{actionError}</ErrorBox></div>}

          {noContract.length > 0 && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-300 bg-red-500/10 border border-red-500/20">
              Sözleşmesi olmayan ama jeton harcanan mekanlar: {noContract.map((r) => r.venue.name).join(", ")} — hakediş hesaplanamaz.
            </div>
          )}

          {rows.length === 0 ? (
            <Empty>Bu ay jeton harcanan ya da sözleşmesi olan mekan yok</Empty>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-xs text-[#6b7280] border-b border-white/10">
                    <th className="px-4 py-3 font-medium">Mekan</th>
                    <th className="px-3 py-3 font-medium text-right">Ücretli jeton</th>
                    <th className="px-3 py-3 font-medium text-right">Brüt</th>
                    <th className="px-3 py-3 font-medium text-right">Net</th>
                    <th className="px-3 py-3 font-medium text-right">Kom.</th>
                    <th className="px-3 py-3 font-medium text-right">Hakediş</th>
                    <th className="px-3 py-3 font-medium">Vade</th>
                    <th className="px-4 py-3 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const p = r.payout;
                    const pv = r.preview;
                    return (
                      <tr
                        key={r.venue.id}
                        onClick={() => p && setSelected(p.id)}
                        className={`border-b border-white/[0.06] last:border-0 ${p ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-white">{r.venue.name}</p>
                          <p className="text-xs text-[#6b7280]">{formatNumber(r.usage.requests)} istek</p>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#d1d5db]">{formatNumber(p ? p.tokens : r.usage.paid_tokens)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#d1d5db]">{p ? formatTL(Number(p.gross_amount)) : pv ? formatTL(pv.gross) : "-"}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#d1d5db]">{p ? formatTL(Number(p.net_amount)) : pv ? formatTL(pv.net) : "-"}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#9ca3af]">
                          {p ? `%${formatNumber(Number(p.commission_pct))}` : r.contract ? `%${formatNumber(Number(r.contract.commission_pct))}` : "-"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-white">
                          {p ? formatTL(Number(p.amount)) : pv ? <span className="text-[#9ca3af] font-normal italic">{formatTL(pv.computed)}</span> : "-"}
                          {p && Number(p.adjustment) !== 0 && <p className="text-xs font-normal text-[#f59e0b]">düzeltmeli</p>}
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: p && isOverdue(p.status, p.due_date, today) ? "#ef4444" : "#9ca3af" }}>
                          {p ? formatDay(p.due_date) : pv ? formatDay(pv.due_date) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {p ? <StatusBadge p={p} /> : r.contract ? <Badge label="Önizleme" color="#6b7280" /> : <Badge label="Sözleşme yok" color="#ef4444" />}
                        </td>
                      </tr>
                    );
                  })}
                  {data.orphans.map((p) => (
                    <tr key={p.id} onClick={() => setSelected(p.id)} className="cursor-pointer hover:bg-white/[0.03] border-t border-white/[0.06]">
                      <td className="px-4 py-3 text-[#9ca3af]">{p.venue_name} <span className="text-xs">(silinmiş mekan)</span></td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#9ca3af]">{formatNumber(p.tokens)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#9ca3af]">{formatTL(Number(p.gross_amount))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#9ca3af]">{formatTL(Number(p.net_amount))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#9ca3af]">%{formatNumber(Number(p.commission_pct))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{formatTL(Number(p.amount))}</td>
                      <td className="px-3 py-3 text-xs text-[#9ca3af]">{formatDay(p.due_date)}</td>
                      <td className="px-4 py-3"><StatusBadge p={p} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {openOther.length > 0 && (
            <div className="mt-8">
              <h2 className="text-white font-semibold text-base mb-3">Diğer aylardan ödenmemiş hakedişler</h2>
              <Card className="divide-y divide-white/[0.06]">
                {openOther.map((p) => (
                  <button key={p.id} onClick={() => setSelected(p.id)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm text-white">{p.venue_name}</p>
                      <p className="text-xs text-[#6b7280] capitalize">{monthLabel(p.period_start.slice(0, 7))}</p>
                    </div>
                    <span className="text-xs" style={{ color: isOverdue(p.status, p.due_date, today) ? "#ef4444" : "#9ca3af" }}>
                      Vade {formatDay(p.due_date)}
                    </span>
                    <span className="text-sm text-white font-semibold tabular-nums">{formatTL(Number(p.amount))}</span>
                    <StatusBadge p={p} />
                  </button>
                ))}
              </Card>
            </div>
          )}
        </>
      )}

      {settingsOpen && data && (
        <SettingsModal
          initial={data.settings}
          unitPrice={data.unit_price}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            load();
          }}
        />
      )}

      {selectedPayout && (
        <PayoutModal key={selectedPayout.id} payout={selectedPayout} row={selectedRow} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}
