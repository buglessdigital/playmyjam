"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

type ManagedVenue = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string;
  status: "active" | "inactive";
  created_at: string;
  venue_admins: { username: string }[];
};

const ACCENT = "#f59e0b";

function AdminCredentialsModal({ venue, onClose }: { venue: ManagedVenue; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const admin = venue.venue_admins?.[0];
  const copyAll = () => {
    const text = `Mekan: ${venue.name}\nAdmin Paneli: ${window.location.origin}/admin/${venue.slug}\nKullanıcı Adı: ${admin?.username ?? "-"}\nŞifre: (super-admin panelinden düzenle)`;
    copy(text, "all");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6"
        style={{ background: "#1a1025" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-base">Admin Bilgileri</h3>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="text-[#9ca3af] text-xs mb-4">{venue.name}</p>

        <div className="flex flex-col gap-3 mb-5">
          {/* Admin paneli linki */}
          <div className="rounded-xl p-3 border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="text-[#6b7280] text-xs mb-1">Admin Paneli Linki</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-white text-sm truncate">/admin/{venue.slug}</p>
              <button
                onClick={() => copy(`${window.location.origin}/admin/${venue.slug}`, "link")}
                className="shrink-0 text-xs px-2 py-1 rounded-lg transition-all"
                style={{ background: copied === "link" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.08)", color: copied === "link" ? "#22c55e" : "#9ca3af" }}
              >
                {copied === "link" ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
          </div>

          {/* Kullanıcı adı */}
          <div className="rounded-xl p-3 border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="text-[#6b7280] text-xs mb-1">Kullanıcı Adı</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-white text-sm font-mono">{admin?.username ?? "-"}</p>
              <button
                onClick={() => copy(admin?.username ?? "", "user")}
                className="shrink-0 text-xs px-2 py-1 rounded-lg transition-all"
                style={{ background: copied === "user" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.08)", color: copied === "user" ? "#22c55e" : "#9ca3af" }}
              >
                {copied === "user" ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
          </div>

          {/* Şifre */}
          <div className="rounded-xl p-3 border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="text-[#6b7280] text-xs mb-1">Şifre</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[#6b7280] text-sm font-mono italic">Güvenlik için gösterilmiyor</p>
              <Link href={`/super-admin/venues/${venue.slug}/edit`} className="shrink-0 text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af" }}>
                Sıfırla
              </Link>
            </div>
          </div>
        </div>

        <button
          onClick={copyAll}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: copied === "all" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: copied === "all" ? "#22c55e" : ACCENT, border: `1px solid ${copied === "all" ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}` }}
        >
          {copied === "all" ? "Tümü Kopyalandı!" : "Tüm Bilgileri Kopyala"}
        </button>
      </div>
    </div>
  );
}

function DeleteVenueModal({
  venue,
  onClose,
  onDeleted,
}: {
  venue: ManagedVenue;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const canDelete = confirmText.trim() === venue.name;

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError(false);
    const res = await fetch(`/api/super-admin/venues/${venue.slug}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      onDeleted(venue.id);
      onClose();
    } else {
      setError(true);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6"
        style={{ background: "#1a1025" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-base">Mekanı Sil</h3>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="rounded-xl p-3 border border-red-500/20 bg-red-500/10 mb-4">
          <p className="text-red-400 text-xs leading-relaxed">
            <span className="font-semibold">{venue.name}</span> mekanı kalıcı olarak silinecek. Kuyruk, şarkı
            istekleri, jetonlar, admin hesapları ve mekana ait tüm veriler de silinir. Bu işlem geri alınamaz.
          </p>
        </div>

        <p className="text-[#9ca3af] text-xs mb-2">
          Onaylamak için mekan adını yazın: <span className="text-white font-mono">{venue.name}</span>
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={venue.name}
          className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none border border-white/10 focus:border-red-500/50 mb-4"
          style={{ background: "rgba(255,255,255,0.04)" }}
        />

        {error && (
          <p className="text-red-400 text-xs mb-3">Mekan silinemedi, tekrar deneyin.</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af" }}
          >
            Vazgeç
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            {deleting ? "Siliniyor..." : "Kalıcı Olarak Sil"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [credentialsFor, setCredentialsFor] = useState<ManagedVenue | null>(null);
  const [deleteFor, setDeleteFor] = useState<ManagedVenue | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/super-admin/venues")
      .then((r) => {
        if (!r.ok) throw new Error("Mekanlar yüklenemedi");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setVenues(data);
      })
      .catch(() => setLoadError(true));
  }, []);

  const toggleStatus = async (venue: ManagedVenue) => {
    const newStatus = venue.status === "active" ? "inactive" : "active";
    // Optimistic güncelleme — hata olursa geri al
    setVenues((prev) => prev.map((v) => (v.id === venue.id ? { ...v, status: newStatus } : v)));
    const res = await fetch(`/api/super-admin/venues/${venue.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => null);
    if (!res?.ok) {
      setVenues((prev) => prev.map((v) => (v.id === venue.id ? { ...v, status: venue.status } : v)));
    }
  };

  const copyCustomerLink = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/venue/${slug}`);
    setCopiedLink(slug);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {credentialsFor && (
        <AdminCredentialsModal venue={credentialsFor} onClose={() => setCredentialsFor(null)} />
      )}

      {deleteFor && (
        <DeleteVenueModal
          venue={deleteFor}
          onClose={() => setDeleteFor(null)}
          onDeleted={(id) => setVenues((prev) => prev.filter((v) => v.id !== id))}
        />
      )}

      {loadError && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          Mekanlar yüklenemedi, sayfayı yenileyin.
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Mekanlar</h1>
          <p className="text-[#6b7280] text-sm mt-1">{venues.length} mekan kayıtlı</p>
        </div>
        <Link
          href="/super-admin/venues/new"
          className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0"
          style={{ background: ACCENT, color: "#0f0a18" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          Yeni Mekan
        </Link>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Mekan", "Slug / Link", "Kullanıcı", "Durum", "İşlemler"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-[#6b7280] text-xs font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {venues.map((venue, i) => (
              <tr
                key={venue.slug}
                className="transition-all hover:bg-white/[0.03]"
                style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ background: "rgba(245,158,11,0.1)", color: ACCENT }}
                    >
                      {venue.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{venue.name}</p>
                      <p className="text-[#6b7280] text-xs">{venue.tagline}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <p className="text-[#9ca3af] text-xs font-mono">{venue.slug}</p>
                </td>
                <td className="px-5 py-4">
                  <p className="text-[#9ca3af] text-sm">{venue.venue_admins?.[0]?.username ?? "-"}</p>
                </td>
                <td className="px-5 py-4">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: venue.status === "active" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.06)",
                      color: venue.status === "active" ? "#22c55e" : "#6b7280",
                    }}
                  >
                    {venue.status === "active" ? "Aktif" : "Pasif"}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <a
                      href={`/admin/${venue.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                      style={{ background: "rgba(245,158,11,0.1)", color: ACCENT }}
                    >
                      Admin Paneli
                    </a>
                    <button
                      onClick={() => copyCustomerLink(venue.slug)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                      style={{ background: copiedLink === venue.slug ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.08)", color: copiedLink === venue.slug ? "#22c55e" : "#9ca3af" }}
                    >
                      {copiedLink === venue.slug ? "Kopyalandı!" : "Müşteri Linki"}
                    </button>
                    <button
                      onClick={() => setCredentialsFor(venue)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                      style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}
                    >
                      Bilgiler
                    </button>
                    <Link
                      href={`/super-admin/venues/${venue.slug}/edit`}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af" }}
                    >
                      Düzenle
                    </Link>
                    <button
                      onClick={() => toggleStatus(venue)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                      style={{ background: venue.status === "active" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: venue.status === "active" ? "#ef4444" : "#22c55e" }}
                    >
                      {venue.status === "active" ? "Pasife Al" : "Aktife Al"}
                    </button>
                    <button
                      onClick={() => setDeleteFor(venue)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                      style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
                    >
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {venues.map((venue) => (
          <div
            key={venue.slug}
            className="rounded-2xl border border-white/10 p-4"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ background: "rgba(245,158,11,0.1)", color: ACCENT }}
                >
                  {venue.name.charAt(0)}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{venue.name}</p>
                  <p className="text-[#6b7280] text-xs font-mono">{venue.slug}</p>
                </div>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                style={{
                  background: venue.status === "active" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.06)",
                  color: venue.status === "active" ? "#22c55e" : "#6b7280",
                }}
              >
                {venue.status === "active" ? "Aktif" : "Pasif"}
              </span>
            </div>

            <p className="text-[#6b7280] text-xs mb-3">{venue.venue_admins?.[0]?.username ?? "-"} kullanıcı</p>

            <div className="flex flex-wrap gap-2">
              <a
                href={`/admin/${venue.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                style={{ background: "rgba(245,158,11,0.1)", color: ACCENT }}
              >
                Admin Paneli
              </a>
              <button
                onClick={() => copyCustomerLink(venue.slug)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                style={{ background: copiedLink === venue.slug ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.08)", color: copiedLink === venue.slug ? "#22c55e" : "#9ca3af" }}
              >
                {copiedLink === venue.slug ? "Kopyalandı!" : "Müşteri Linki"}
              </button>
              <button
                onClick={() => setCredentialsFor(venue)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}
              >
                Bilgiler
              </button>
              <Link
                href={`/super-admin/venues/${venue.slug}/edit`}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af" }}
              >
                Düzenle
              </Link>
              <button
                onClick={() => toggleStatus(venue)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                style={{ background: venue.status === "active" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: venue.status === "active" ? "#ef4444" : "#22c55e" }}
              >
                {venue.status === "active" ? "Pasife Al" : "Aktife Al"}
              </button>
              <button
                onClick={() => setDeleteFor(venue)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
