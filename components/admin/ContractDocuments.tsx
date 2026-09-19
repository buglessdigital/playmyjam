"use client";

import { useEffect, useState } from "react";
import { DOCUMENT_STATUS_META, type VenueDocumentStatus } from "@/lib/venue-documents-meta";

const ACCENT = "#e91e8c";

export type VenueDocument = {
  id: string;
  title: string;
  body: string;
  status: VenueDocumentStatus;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_username: string | null;
  accepted_sha256: string | null;
  withdrawn_at: string | null;
  updated_at?: string;
};

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Istanbul",
      })
    : "-";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Yazdır / PDF olarak kaydet: metin sade bir pencerede açılır
function printDocument(doc: VenueDocument) {
  const w = window.open("", "_blank");
  if (!w) return;
  const footer = doc.accepted_at
    ? `<p class="meta">${escapeHtml(doc.accepted_username ?? "")} tarafından ${escapeHtml(formatDateTime(doc.accepted_at))} tarihinde elektronik olarak onaylanmıştır.<br>SHA-256: ${escapeHtml(doc.accepted_sha256 ?? "")}</p>`
    : "";
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 20px;color:#111;line-height:1.6}
h1{font-size:20px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px}.meta{margin-top:32px;font-size:12px;color:#555;border-top:1px solid #ccc;padding-top:12px;word-break:break-all}</style>
</head><body><h1>${escapeHtml(doc.title)}</h1><pre>${escapeHtml(doc.body)}</pre>${footer}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

function PendingDocument({ doc, onAccepted }: { doc: VenueDocument; onAccepted: (remaining: number) => void }) {
  const [readToEnd, setReadToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const accept = async () => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/documents/${doc.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, seen_updated_at: doc.updated_at }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) {
      onAccepted(Number(data?.remaining ?? 0));
      return;
    }
    setError(data?.error ?? "Onay kaydedilemedi, tekrar deneyin.");
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(233,30,140,0.35)", background: "rgba(233,30,140,0.04)" }}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h2 className="text-white font-semibold text-base">{doc.title}</h2>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
          Onay bekliyor
        </span>
      </div>
      <p className="text-xs text-[#6b7280] mb-4">Gönderildi: {formatDateTime(doc.sent_at)}</p>

      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
        }}
        ref={(el) => {
          // Metin kutuya sığıyorsa kaydırma gerekmez
          if (el && !readToEnd && el.scrollHeight <= el.clientHeight + 24) setReadToEnd(true);
        }}
        className="max-h-[50vh] overflow-y-auto rounded-xl border border-white/10 p-4 text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed"
        style={{ background: "rgba(0,0,0,0.25)" }}
      >
        {doc.body}
      </div>
      {!readToEnd && <p className="text-xs text-[#9ca3af] mt-2">Onaylamak için metni sonuna kadar kaydırın.</p>}

      <label className={`mt-4 flex items-start gap-2.5 text-sm ${readToEnd ? "text-[#d1d5db] cursor-pointer" : "text-[#6b7280]"}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!readToEnd}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-pink-600"
        />
        Sözleşmenin tamamını okudum; mekan adına onaylamaya yetkiliyim ve koşulları kabul ediyorum.
      </label>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => printDocument(doc)}
          className="text-sm px-4 py-2.5 rounded-xl font-medium"
          style={{ background: "rgba(255,255,255,0.08)", color: "#d1d5db" }}
        >
          Yazdır / PDF
        </button>
        <button
          onClick={accept}
          disabled={!checked || busy}
          className="text-sm px-5 py-2.5 rounded-xl font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#fff" }}
        >
          {busy ? "Onaylanıyor…" : "Sözleşmeyi Onayla"}
        </button>
      </div>
    </div>
  );
}

function ArchivedDocument({ doc }: { doc: VenueDocument }) {
  const [open, setOpen] = useState(false);
  const meta = DOCUMENT_STATUS_META[doc.status];
  return (
    <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-white font-medium text-sm">{doc.title}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${meta.color}1f`, color: meta.color }}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-[#6b7280] mt-1">
            {doc.accepted_at
              ? `${doc.accepted_username || "Yetkili"} tarafından ${formatDateTime(doc.accepted_at)} tarihinde onaylandı`
              : `Gönderildi ${formatDateTime(doc.sent_at)}`}
            {doc.withdrawn_at && ` · geçersiz: ${formatDateTime(doc.withdrawn_at)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOpen((v) => !v)} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#d1d5db" }}>
            {open ? "Gizle" : "Görüntüle"}
          </button>
          <button onClick={() => printDocument(doc)} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "rgba(233,30,140,0.12)", color: ACCENT }}>
            Yazdır / PDF
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 p-4 text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed">
          {doc.body}
        </div>
      )}
    </div>
  );
}

// onlyPending: panel kilidindeki onay ekranı yalnızca bekleyenleri gösterir
export default function ContractDocuments({
  onlyPending = false,
  onAllAccepted,
}: {
  onlyPending?: boolean;
  onAllAccepted?: () => void;
}) {
  const [docs, setDocs] = useState<VenueDocument[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/documents")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDocs)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm text-red-400">Sözleşmeler yüklenemedi, sayfayı yenileyin.</p>;
  if (!docs) return <p className="py-10 text-center text-sm text-[#6b7280]">Yükleniyor…</p>;

  const pending = docs.filter((d) => d.status === "pending");
  const others = docs.filter((d) => d.status !== "pending");

  const handleAccepted = (id: string, remaining: number) => {
    setDocs((prev) =>
      prev ? prev.map((d) => (d.id === id ? { ...d, status: "accepted" as const, accepted_at: new Date().toISOString() } : d)) : prev
    );
    if (remaining === 0) onAllAccepted?.();
  };

  return (
    <div className="flex flex-col gap-4">
      {pending.map((d) => (
        <PendingDocument key={d.id} doc={d} onAccepted={(remaining) => handleAccepted(d.id, remaining)} />
      ))}
      {!onlyPending &&
        (others.length === 0 && pending.length === 0 ? (
          <div className="py-14 text-center rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-sm text-[#6b7280]">Henüz sözleşme yok</p>
          </div>
        ) : (
          others.map((d) => <ArchivedDocument key={d.id} doc={d} />)
        ))}
    </div>
  );
}
