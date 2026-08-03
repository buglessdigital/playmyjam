"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const ACCENT = "#f59e0b";

type Status = "new" | "contacted" | "approved" | "rejected";

type Application = {
  id: string;
  venue_name: string;
  contact_name: string;
  phone: string;
  email: string;
  city: string;
  venue_type: string;
  message: string;
  notes: string;
  status: Status;
  created_at: string;
};

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  new: { label: "Yeni", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  contacted: { label: "Arandı", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  approved: { label: "Onaylandı", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  rejected: { label: "Reddedildi", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

const STATUS_ORDER: Status[] = ["new", "contacted", "approved", "rejected"];

const FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "Tümü" },
  ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label })),
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function ApplicationCard({
  app,
  onStatusChange,
  onNotesChange,
  onDelete,
}: {
  app: Application;
  onStatusChange: (id: string, status: Status) => void;
  onNotesChange: (id: string, notes: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState(app.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = STATUS_META[app.status];

  const saveNotes = async () => {
    setSavingNotes(true);
    await onNotesChange(app.id, notes);
    setSavingNotes(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  // Onaylanan başvuru "Yeni Mekan" ekranına taşınır; ad alanı önden dolsun
  const newVenueHref = `/super-admin/venues/new?name=${encodeURIComponent(app.venue_name)}`;

  return (
    <div
      className="rounded-2xl border border-white/10 p-5"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-white font-semibold text-base">{app.venue_name}</h3>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: meta.bg, color: meta.color }}
            >
              {meta.label}
            </span>
            {app.venue_type && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
              >
                {app.venue_type}
              </span>
            )}
          </div>
          <p className="text-[#6b7280] text-xs mt-1">
            {formatDate(app.created_at)}
            {app.city && ` · ${app.city}`}
          </p>
        </div>

        <Link
          href={newVenueHref}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
          style={{ background: "rgba(245,158,11,0.12)", color: ACCENT }}
        >
          Mekan Oluştur
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[#6b7280] text-xs mb-0.5">Yetkili</p>
          <p className="text-white text-sm">{app.contact_name}</p>
        </div>
        <div>
          <p className="text-[#6b7280] text-xs mb-0.5">Telefon</p>
          <a href={`tel:${app.phone.replace(/\s/g, "")}`} className="text-sm text-[#9ca3af] hover:text-white">
            {app.phone}
          </a>
        </div>
        <div className="min-w-0">
          <p className="text-[#6b7280] text-xs mb-0.5">E-posta</p>
          <a href={`mailto:${app.email}`} className="block truncate text-sm text-[#9ca3af] hover:text-white">
            {app.email}
          </a>
        </div>
      </div>

      {app.message && (
        <div className="mt-4 rounded-xl p-3 border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-[#6b7280] text-xs mb-1">Mesaj</p>
          <p className="text-[#d1d5db] text-sm whitespace-pre-wrap break-words">{app.message}</p>
        </div>
      )}

      {/* Durum */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[#6b7280] text-xs mr-1">Durum:</span>
        {STATUS_ORDER.map((s) => {
          const active = app.status === s;
          return (
            <button
              key={s}
              onClick={() => onStatusChange(app.id, s)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: active ? STATUS_META[s].bg : "rgba(255,255,255,0.05)",
                color: active ? STATUS_META[s].color : "#6b7280",
                border: `1px solid ${active ? STATUS_META[s].color + "55" : "transparent"}`,
              }}
            >
              {STATUS_META[s].label}
            </button>
          );
        })}
      </div>

      {/* Not */}
      <div className="mt-4">
        <p className="text-[#6b7280] text-xs mb-1.5">Not (yalnızca sen görürsün)</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Görüşme notların…"
          className="w-full resize-y rounded-xl px-3 py-2.5 text-sm text-white outline-none border border-white/10 focus:border-white/25"
          style={{ background: "rgba(255,255,255,0.04)" }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={saveNotes}
            disabled={savingNotes || notes === app.notes}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40"
            style={{
              background: notesSaved ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.08)",
              color: notesSaved ? "#22c55e" : "#9ca3af",
            }}
          >
            {notesSaved ? "Kaydedildi" : savingNotes ? "Kaydediliyor…" : "Notu Kaydet"}
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af" }}
              >
                Vazgeç
              </button>
              <button
                onClick={() => onDelete(app.id)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                Kalıcı Olarak Sil
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            >
              Sil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Status | "all">("all");

  useEffect(() => {
    fetch("/api/super-admin/applications")
      .then((r) => {
        if (!r.ok) throw new Error("Talepler yüklenemedi");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setApplications(data);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const base: Record<Status, number> = { new: 0, contacted: 0, approved: 0, rejected: 0 };
    for (const a of applications) base[a.status] += 1;
    return base;
  }, [applications]);

  const visible = useMemo(
    () => (filter === "all" ? applications : applications.filter((a) => a.status === filter)),
    [applications, filter]
  );

  const patch = async (id: string, payload: Record<string, string>) => {
    const res = await fetch(`/api/super-admin/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    return Boolean(res?.ok);
  };

  const handleStatusChange = async (id: string, status: Status) => {
    const previous = applications.find((a) => a.id === id)?.status;
    if (!previous || previous === status) return;
    // Optimistic güncelleme — hata olursa geri al
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    const ok = await patch(id, { status });
    if (!ok) {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: previous } : a)));
    }
  };

  const handleNotesChange = async (id: string, notes: string) => {
    const ok = await patch(id, { notes });
    if (ok) setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, notes } : a)));
  };

  const handleDelete = async (id: string) => {
    const removed = applications.find((a) => a.id === id);
    setApplications((prev) => prev.filter((a) => a.id !== id));
    const res = await fetch(`/api/super-admin/applications/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && removed) {
      setApplications((prev) => [removed, ...prev]);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Mekan Talepleri</h1>
        <p className="text-[#6b7280] text-sm mt-1">
          Ana sayfadaki kayıt formundan gelen başvurular · {counts.new} yeni
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === "all" ? applications.length : counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
              style={{
                background: active ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
                color: active ? ACCENT : "#9ca3af",
                border: `1px solid ${active ? "rgba(245,158,11,0.35)" : "transparent"}`,
              }}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {loadError ? (
        <div className="px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          Talepler yüklenemedi, sayfayı yenileyin.
        </div>
      ) : loading ? (
        <p className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
          <p className="text-[#6b7280] text-sm">
            {applications.length === 0 ? "Henüz mekan talebi yok" : "Bu durumda talep yok"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onStatusChange={handleStatusChange}
              onNotesChange={handleNotesChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
