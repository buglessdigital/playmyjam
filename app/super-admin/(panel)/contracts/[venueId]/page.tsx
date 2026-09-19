"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { formatDateTime, type PayoutSettings } from "@/lib/business";
import { DOCUMENT_KINDS, contractDocument, type ContractFields, type DocumentKind } from "@/lib/contract-template";
import { DOCUMENT_STATUS_META, type VenueDocumentStatus } from "@/lib/venue-documents-meta";
import { Badge, Button, Card, Empty, ErrorBox, Modal, PageHeader, Select, TextInput, api } from "@/components/super-admin/ui";

type Doc = {
  id: string;
  title: string;
  body: string;
  status: VenueDocumentStatus;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_username: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  accepted_sha256: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
};

type Data = {
  venue: { id: string; slug: string; name: string };
  contract: ContractFields | null;
  documents: Doc[];
};

function Editor({
  data,
  doc,
  onClose,
  onSaved,
}: {
  data: Data;
  doc: Doc | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [body, setBody] = useState(doc?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<DocumentKind>("service");

  const fillTemplate = async () => {
    const s = await api<PayoutSettings & { unit_price: number }>("/api/super-admin/payout-settings").catch(() => null);
    if (!s) {
      setError("Kesinti oranları okunamadı");
      return;
    }
    const t = contractDocument(kind, { venueName: data.venue.name, contract: data.contract, settings: s, unitPrice: s.unit_price });
    setTitle(t.title);
    setBody(t.body);
  };

  const save = async (send: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (doc) {
        await api(`/api/super-admin/documents/${doc.id}`, "PATCH", { title, body });
        if (send && doc.status === "draft") await api(`/api/super-admin/documents/${doc.id}`, "PATCH", { action: "send" });
      } else {
        await api("/api/super-admin/documents", "POST", { venue_id: data.venue.id, title, body, send });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
      setBusy(false);
    }
  };

  const placeholders = (body.match(/\[[A-ZÇĞİÖŞÜ ]+\]/g) ?? []).filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Modal title={doc ? "Sözleşmeyi Düzenle" : "Yeni Sözleşme"} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        {!doc && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2.5">
            <p className="text-xs text-[#9ca3af] flex-1 min-w-[200px]">
              Şablon, mekanın komisyon / ödeme / fatura bilgileriyle doldurulur{data.contract ? "" : " (sözleşme koşulları girilmemiş — boşluklar işaretli kalır)"}.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={kind} onChange={setKind} options={DOCUMENT_KINDS.map((d) => ({ value: d.kind, label: d.title }))} />
              <Button variant="accent" onClick={fillTemplate}>
                Şablondan Doldur
              </Button>
            </div>
          </div>
        )}
        {doc?.status === "pending" && (
          <p className="text-xs text-[#f59e0b]">
            Bu sözleşme mekana gönderildi. Metni değiştirirsen mekan eski metni onaylayamaz, sayfayı yenileyip yeni metni okuması gerekir.
          </p>
        )}
        <TextInput label="Başlık" value={title} onChange={setTitle} maxLength={200} />
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            maxLength={100000}
            placeholder="Sözleşme metni…"
            className="w-full resize-y rounded-xl px-3.5 py-3 text-sm leading-relaxed outline-none text-white font-mono"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <p className="text-xs text-[#6b7280] mt-1">{body.length.toLocaleString("tr-TR")} karakter</p>
        </div>
        {placeholders.length > 0 && (
          <p className="text-xs text-[#f59e0b]">Doldurulmamış alanlar: {placeholders.join(", ")}</p>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Vazgeç</Button>
          {(!doc || doc.status === "draft") && (
            <Button onClick={() => save(false)} disabled={busy || !title.trim() || !body.trim()}>
              Taslak Kaydet
            </Button>
          )}
          <Button variant="primary" onClick={() => save(true)} disabled={busy || !title.trim() || !body.trim() || placeholders.length > 0}>
            {doc?.status === "pending" ? "Kaydet" : "Kaydet ve Mekana Gönder"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DocumentCard({ doc, onEdit, onChanged }: { doc: Doc; onEdit: () => void; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const meta = DOCUMENT_STATUS_META[doc.status];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const act = (action: string) => run(() => api(`/api/super-admin/documents/${doc.id}`, "PATCH", { action }));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-white font-semibold text-sm">{doc.title}</h3>
            <Badge label={meta.label} color={meta.color} />
          </div>
          <p className="text-xs text-[#6b7280] mt-1">
            Oluşturuldu {formatDateTime(doc.created_at)}
            {doc.sent_at && ` · gönderildi ${formatDateTime(doc.sent_at)}`}
            {doc.withdrawn_at && ` · geri çekildi ${formatDateTime(doc.withdrawn_at)}`}
          </p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>{open ? "Metni Gizle" : "Metni Göster"}</Button>
      </div>

      {doc.accepted_at && (
        <div className="mt-4 rounded-xl border px-3 py-2.5 text-xs grid gap-1 sm:grid-cols-2" style={{ borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.06)" }}>
          <p className="text-[#22c55e] sm:col-span-2 font-medium">
            {doc.accepted_username || "Mekan admini"} tarafından {formatDateTime(doc.accepted_at)} tarihinde onaylandı
          </p>
          <p className="text-[#9ca3af]">IP: {doc.accepted_ip || "-"}</p>
          <p className="text-[#9ca3af] truncate" title={doc.accepted_user_agent ?? ""}>Tarayıcı: {doc.accepted_user_agent || "-"}</p>
          <p className="text-[#6b7280] font-mono break-all sm:col-span-2">SHA-256: {doc.accepted_sha256}</p>
        </div>
      )}

      {open && (
        <div className="mt-4 max-h-[420px] overflow-y-auto rounded-xl border border-white/10 p-4 text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed">
          {doc.body}
        </div>
      )}

      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {(doc.status === "draft" || doc.status === "pending") && (
          <Button onClick={onEdit} disabled={busy}>Düzenle</Button>
        )}
        {doc.status === "draft" && (
          <Button variant="primary" onClick={() => act("send")} disabled={busy}>Mekana Gönder</Button>
        )}
        {doc.status === "pending" && (
          <Button onClick={() => act("unsend")} disabled={busy}>Taslağa Geri Al</Button>
        )}
        {(doc.status === "pending" || doc.status === "accepted") &&
          (confirm === "withdraw" ? (
            <>
              <Button onClick={() => setConfirm(null)}>Vazgeç</Button>
              <Button variant="danger" onClick={() => act("withdraw")} disabled={busy}>Evet, Geri Çek</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirm("withdraw")} disabled={busy}>Geri Çek</Button>
          ))}
        {(doc.status === "draft" || (doc.status === "withdrawn" && !doc.accepted_at)) &&
          (confirm === "delete" ? (
            <>
              <Button onClick={() => setConfirm(null)}>Vazgeç</Button>
              <Button variant="danger" onClick={() => run(() => api(`/api/super-admin/documents/${doc.id}`, "DELETE"))} disabled={busy}>
                Kalıcı Olarak Sil
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirm("delete")} disabled={busy}>Sil</Button>
          ))}
      </div>
    </Card>
  );
}

export default function VenueDocumentsPage() {
  return (
    <Suspense>
      <VenueDocuments />
    </Suspense>
  );
}

function VenueDocuments() {
  const { venueId } = useParams<{ venueId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Doc | "new" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api<Data>(`/api/super-admin/documents?venue_id=${venueId}`)
      .then(setData)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Yüklenemedi"));
  }, [venueId]);

  useEffect(load, [load]);

  const sync = async () => {
    setSyncing(true);
    setNotice("");
    try {
      const r = await api<{ missing: string[]; sent: number; updated: number }>("/api/super-admin/documents/sync", "POST", { venue_id: venueId });
      setNotice(
        r.missing.length
          ? `Eksik koşullar: ${r.missing.join(", ")} — Sözleşmeler ekranındaki Koşullar'dan tamamlayın`
          : r.sent + r.updated > 0
            ? `${r.sent + r.updated} belge mekana onaya gönderildi`
            : "Belgeler koşullarla zaten güncel"
      );
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Belgeler oluşturulamadı");
    } finally {
      setSyncing(false);
    }
  };

  if (loadError) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <ErrorBox>{loadError}</ErrorBox>
      </div>
    );
  }
  if (!data) return <p className="py-16 text-center text-[#6b7280] text-sm">Yükleniyor…</p>;

  const pending = data.documents.filter((d) => d.status === "pending").length;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <Link href="/super-admin/contracts" className="text-xs text-[#9ca3af] hover:text-white">
        ← Sözleşmeler
      </Link>
      <div className="mt-3">
        <PageHeader
          title={`${data.venue.name} — Sözleşme Belgeleri`}
          subtitle={
            pending > 0
              ? `${pending} belge onay bekliyor — mekan paneli onaylanana kadar kilitli`
              : "Mekana gönderilen sözleşme onaylanana kadar mekan paneli kilitlenir"
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" onClick={sync} disabled={syncing}>
                {syncing ? "Oluşturuluyor…" : "Koşullardan Oluştur ve Gönder"}
              </Button>
              <Button variant="primary" onClick={() => setEditing("new")}>
                + Yeni Belge
              </Button>
            </div>
          }
        />
      </div>
      {notice && <p className="mb-4 text-sm text-[#d1d5db] rounded-xl border border-white/10 px-4 py-3">{notice}</p>}

      {data.documents.length === 0 ? (
        <Empty>Bu mekana henüz sözleşme eklenmedi</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {data.documents.map((d) => (
            <DocumentCard key={d.id} doc={d} onEdit={() => setEditing(d)} onChanged={load} />
          ))}
        </div>
      )}

      {editing && (
        <Editor
          data={data}
          doc={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
