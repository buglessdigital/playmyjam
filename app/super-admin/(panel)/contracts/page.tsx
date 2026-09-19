"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { formatDay, formatNumber, istanbulToday } from "@/lib/business";
import { DOCUMENT_KINDS, missingContractFields } from "@/lib/contract-template";
import { Badge, Button, Card, Empty, ErrorBox, FilterChips, Modal, PageHeader, TextArea, TextInput, api } from "@/components/super-admin/ui";

type Contract = {
  venue_id: string;
  commission_pct: number;
  payment_day: number;
  start_date: string | null;
  end_date: string | null;
  legal_name: string;
  tax_office: string;
  tax_number: string;
  iban: string;
  account_holder: string;
  billing_email: string;
  contact_name: string;
  contact_phone: string;
  notes: string;
};

type Row = {
  venue: { id: string; slug: string; name: string; status: string; created_at: string };
  contract: Contract | null;
  usage30: { tokens: number; requests: number; last_spend_at: string | null };
};

type Filter = "all" | "missing" | "incomplete" | "ending" | "unsigned";
type DocSummary = Record<string, { draft: number; pending: number; accepted: number }>;
type SyncResult = { missing: string[]; sent: number; updated: number; unchanged: number } | { error: string };

function syncNotice(venueName: string, r: SyncResult): { text: string; tone: "ok" | "warn" } {
  if ("error" in r) return { text: `${venueName}: koşullar kaydedildi ama belgeler oluşturulamadı (${r.error}). Belgeler sayfasından yeniden deneyin.`, tone: "warn" };
  if (r.missing.length > 0) return { text: `${venueName}: koşullar kaydedildi. Belgelerin oluşması için eksik: ${r.missing.join(", ")}`, tone: "warn" };
  const changed = r.sent + r.updated;
  if (changed === 0) return { text: `${venueName}: koşullar kaydedildi, belgeler zaten güncel.`, tone: "ok" };
  return { text: `${venueName}: ${changed} belge mekana onaya gönderildi. Mekan paneli onaylanana kadar kilitli.`, tone: "ok" };
}

const EMPTY: Omit<Contract, "venue_id"> = {
  commission_pct: 0,
  payment_day: 15,
  start_date: null,
  end_date: null,
  legal_name: "",
  tax_office: "",
  tax_number: "",
  iban: "",
  account_holder: "",
  billing_email: "",
  contact_name: "",
  contact_phone: "",
  notes: "",
};

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function problems(c: Contract | null, today: string): string[] {
  if (!c) return ["Sözleşme yok"];
  const p: string[] = [];
  if (Number(c.commission_pct) <= 0) p.push("Komisyon 0");
  if (!c.iban) p.push("IBAN yok");
  if (!c.tax_number) p.push("Vergi no yok");
  if (c.end_date && c.end_date < today) p.push("Süresi doldu");
  else if (c.end_date && c.end_date <= addDays(today, 30)) p.push("30 gün içinde bitiyor");
  return p;
}

function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function ContractModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: (c: Contract, docs: SyncResult) => void }) {
  const init = row.contract ?? { ...EMPTY, venue_id: row.venue.id };
  const [f, setF] = useState({
    ...init,
    commission_pct: String(init.commission_pct),
    payment_day: String(init.payment_day),
    start_date: init.start_date ?? "",
    end_date: init.end_date ?? "",
    iban: formatIban(init.iban),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [key]: v }));
  const missing = missingContractFields(f);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await api<{ contract: Contract; documents: SyncResult }>(`/api/super-admin/contracts/${row.venue.id}`, "PUT", {
        ...f,
        commission_pct: Number(f.commission_pct),
        payment_day: Number(f.payment_day),
      });
      onSaved(res.contract, res.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
      setSaving(false);
    }
  };

  return (
    <Modal title={`${row.venue.name} — Sözleşme`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Mekan komisyonu (%)" type="number" min="0" max="100" step="0.01" value={f.commission_pct} onChange={set("commission_pct")} />
          <TextInput label="Ödeme günü (sonraki ayın)" type="number" min="1" max="28" value={f.payment_day} onChange={set("payment_day")} />
        </div>
        <p className="text-xs text-[#6b7280] -mt-2">
          Hakediş = komisyon × (ciro − KDV − banka komisyonu − ek kesinti). Kesinti oranları Hakedişler ekranında.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Sözleşme başlangıcı" type="date" value={f.start_date} onChange={set("start_date")} />
          <TextInput label="Sözleşme bitişi" type="date" value={f.end_date} onChange={set("end_date")} />
        </div>

        <p className="text-white text-sm font-semibold mt-2">Fatura bilgileri</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Ticari unvan" value={f.legal_name} onChange={set("legal_name")} maxLength={200} />
          <TextInput label="Fatura e-postası" type="email" value={f.billing_email} onChange={set("billing_email")} maxLength={160} />
          <TextInput label="Vergi dairesi" value={f.tax_office} onChange={set("tax_office")} maxLength={80} />
          <TextInput label="Vergi / TC no" value={f.tax_number} onChange={set("tax_number")} maxLength={20} mono />
        </div>

        <p className="text-white text-sm font-semibold mt-2">Ödeme bilgileri</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="IBAN" value={f.iban} onChange={set("iban")} placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={40} mono />
          <TextInput label="Hesap sahibi" value={f.account_holder} onChange={set("account_holder")} maxLength={200} />
        </div>

        <p className="text-white text-sm font-semibold mt-2">İletişim</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Muhatap" value={f.contact_name} onChange={set("contact_name")} maxLength={120} />
          <TextInput label="Telefon" type="tel" value={f.contact_phone} onChange={set("contact_phone")} maxLength={40} />
        </div>
        <TextArea label="Notlar / özel şartlar" value={f.notes} onChange={set("notes")} rows={3} maxLength={4000} />

        <div
          className="rounded-xl border px-3 py-2.5 text-xs leading-relaxed"
          style={missing.length ? { borderColor: "rgba(245,158,11,0.3)", color: "#f59e0b" } : { borderColor: "rgba(34,197,94,0.3)", color: "#22c55e" }}
        >
          {missing.length ? (
            <>Belgelerin otomatik oluşması için eksik: {missing.join(", ")}</>
          ) : (
            <>
              Kaydedince {DOCUMENT_KINDS.map((d) => d.title).join(", ")} bu koşullarla oluşturulup mekana onaya gönderilir. Mekan
              paneli onaylanana kadar kilitli kalır; koşul değişirse yalnızca metni değişen belge yeniden onaya gider.
            </>
          )}
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Kaydediliyor…" : missing.length ? "Kaydet" : "Kaydet ve Belgeleri Gönder"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ContractsPage() {
  return (
    <Suspense>
      <ContractsPageContent />
    </Suspense>
  );
}

function ContractsPageContent() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [docs, setDocs] = useState<DocSummary>({});
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const today = istanbulToday();

  const loadDocs = () => {
    api<DocSummary>("/api/super-admin/documents").then(setDocs).catch(() => {});
  };
  useEffect(loadDocs, []);

  useEffect(() => {
    api<Row[]>("/api/super-admin/contracts")
      .then(setRows)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    let missing = 0, incomplete = 0, ending = 0;
    for (const r of rows) {
      if (!r.contract) missing++;
      else if (problems(r.contract, today).some((p) => p !== "30 gün içinde bitiyor" && p !== "Süresi doldu")) incomplete++;
      if (r.contract?.end_date && r.contract.end_date <= addDays(today, 30)) ending++;
    }
    const unsigned = rows.filter((r) => !docs[r.venue.id]?.accepted).length;
    return { missing, incomplete, ending, unsigned };
  }, [rows, today, docs]);

  const visible = rows.filter((r) => {
    if (filter === "missing") return !r.contract;
    if (filter === "incomplete") return r.contract && problems(r.contract, today).some((p) => p !== "30 gün içinde bitiyor" && p !== "Süresi doldu");
    if (filter === "unsigned") return !docs[r.venue.id]?.accepted;
    if (filter === "ending") return r.contract?.end_date && r.contract.end_date <= addDays(today, 30);
    return true;
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <PageHeader title="Sözleşmeler" subtitle="Mekan komisyon oranları, ödeme günleri, fatura ve banka bilgileri" />

      {notice && (
        <div
          className="mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
          style={notice.tone === "ok" ? { borderColor: "rgba(34,197,94,0.3)", color: "#22c55e" } : { borderColor: "rgba(245,158,11,0.3)", color: "#f59e0b" }}
        >
          <p>{notice.text}</p>
          <button onClick={() => setNotice(null)} className="text-xs text-[#9ca3af] hover:text-white shrink-0">
            Kapat
          </button>
        </div>
      )}

      <div className="mb-5">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "Tümü", count: rows.length },
            { key: "missing", label: "Sözleşmesiz", count: counts.missing, color: "#ef4444" },
            { key: "incomplete", label: "Eksik bilgili", count: counts.incomplete },
            { key: "ending", label: "Bitiyor / bitti", count: counts.ending, color: "#f97316" },
            { key: "unsigned", label: "Onaylı belgesi yok", count: counts.unsigned, color: "#a78bfa" },
          ]}
        />
      </div>

      {loadError ? (
        <ErrorBox>Sözleşmeler yüklenemedi, sayfayı yenileyin.</ErrorBox>
      ) : loading ? (
        <p className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        <Empty>Bu filtrede mekan yok</Empty>
      ) : (
        <Card className="divide-y divide-white/[0.06]">
          {visible.map((r) => {
            const c = r.contract;
            const issues = problems(c, today);
            return (
              <div key={r.venue.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white text-sm font-medium">{r.venue.name}</span>
                    {r.venue.status !== "active" && <Badge label="Pasif" color="#6b7280" />}
                    {docs[r.venue.id]?.pending ? (
                      <Badge label={`${docs[r.venue.id].pending} belge onay bekliyor`} color="#a78bfa" />
                    ) : docs[r.venue.id]?.accepted ? (
                      <Badge label="Belge onaylı" color="#22c55e" />
                    ) : null}
                    {issues.map((p) => (
                      <Badge key={p} label={p} color={p === "Sözleşme yok" || p === "Süresi doldu" ? "#ef4444" : "#f59e0b"} />
                    ))}
                  </div>
                  <p className="text-xs text-[#6b7280] mt-1">
                    {c
                      ? [
                          `%${formatNumber(Number(c.commission_pct))} komisyon`,
                          `her ayın ${c.payment_day}'i`,
                          c.end_date ? `bitiş ${formatDay(c.end_date)}` : "süresiz",
                          c.iban ? `IBAN …${c.iban.slice(-4)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Hakediş hesaplanması için sözleşme gerekli"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-white">{formatNumber(r.usage30.tokens)} jeton</p>
                  <p className="text-xs text-[#6b7280]">son 30 gün</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/super-admin/contracts/${r.venue.id}`}
                    className="text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap"
                    style={{ background: "rgba(139,92,246,0.12)", color: "#a78bfa" }}
                  >
                    Belgeler
                  </Link>
                  <Button variant={c ? "ghost" : "accent"} onClick={() => setEditing(r)}>
                    {c ? "Koşullar" : "Koşul Ekle"}
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {editing && (
        <ContractModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(c, result) => {
            setRows((prev) => prev.map((r) => (r.venue.id === c.venue_id ? { ...r, contract: c } : r)));
            setNotice(syncNotice(editing.venue.name, result));
            loadDocs();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
