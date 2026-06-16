"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const ACCENT = "#f59e0b";

type ManagedVenue = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "inactive";
  venue_admins: { username: string }[];
};

export default function SuperAdminDashboard() {
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [loadError, setLoadError] = useState(false);

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

  const activeVenues = venues.filter((v) => v.status === "active").length;

  const statCards = [
    { label: "Toplam Mekan", value: venues.length, sub: `${activeVenues} aktif` },
    { label: "Aktif Mekan", value: activeVenues },
    { label: "Pasif Mekan", value: venues.length - activeVenues },
  ];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-[#6b7280] text-sm mt-1">Tüm sistemin genel görünümü</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-4 border border-white/10"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-[#9ca3af] text-xs mb-1">{card.label}</p>
            <p className="text-white text-2xl font-bold">{card.value}</p>
            {card.sub && <p className="text-[#6b7280] text-xs mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-base">Mekanlar</h2>
        <Link
          href="/super-admin/venues/new"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: ACCENT, color: "#0f0a18" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          Yeni Mekan
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {loadError ? (
          <div className="py-10 text-center text-red-400 text-sm">Mekanlar yüklenemedi, sayfayı yenileyin</div>
        ) : venues.length === 0 ? (
          <div className="py-10 text-center text-[#6b7280] text-sm">Henüz mekan yok</div>
        ) : venues.map((venue, i) => (
          <div
            key={venue.slug}
            className="flex items-center gap-4 px-5 py-4 transition-all hover:bg-white/[0.03]"
            style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
              style={{ background: venue.status === "active" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.06)", color: venue.status === "active" ? ACCENT : "#6b7280" }}>
              {venue.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{venue.name}</p>
              <p className="text-[#6b7280] text-xs font-mono">{venue.slug} · {venue.venue_admins?.[0]?.username ?? "-"}</p>
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
            <Link
              href="/super-admin/venues"
              className="text-xs px-3 py-1.5 rounded-xl font-medium shrink-0 transition-all"
              style={{ background: "rgba(245,158,11,0.1)", color: ACCENT }}
            >
              Yönet
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
