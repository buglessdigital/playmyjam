"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const ACCENT = "#f59e0b";

const navItems = [
  {
    href: "/super-admin",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: "/super-admin/health",
    label: "Sağlık",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/analytics",
    label: "Arayüz Analizi",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M5 3l12 6.5-5.2 1.3L9.5 16 5 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M13 13l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/venues",
    label: "Mekanlar",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/applications",
    label: "Mekan Talepleri",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 4h11l5 5v11a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M14 4v6h6M8 14h7M8 17.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/crm",
    label: "Görüşmeler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8.5 11h7M8.5 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/tasks",
    label: "Görevler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 12l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/contracts",
    label: "Sözleşmeler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M6 3h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 17c1-1.5 2-2 3-1s2 .5 3-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9 9h6M9 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/payouts",
    label: "Hakedişler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 10h18M7 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/super-admin/pricing",
    label: "Fiyatlandırma",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v10M15 9.5c0-1.1-1.34-2-3-2s-3 .9-3 2 1.34 2 3 2 3 .9 3 2-1.34 2-3 2-3-.9-3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

function NavContent({
  pathname,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  const isActive = (href: string) =>
    href === "/super-admin" ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-1 flex-1">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            color: isActive(item.href) ? ACCENT : "#9ca3af",
            background: isActive(item.href) ? "rgba(245,158,11,0.1)" : "transparent",
          }}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
      <button
        onClick={onLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mt-auto text-left"
        style={{ color: "#9ca3af" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Çıkış Yap
      </button>
    </nav>
  );
}

export default function SuperAdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/api/super-admin/logout", { method: "POST" });
    } finally {
      router.push("/super-admin/login");
    }
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col h-screen sticky top-0 w-[240px] shrink-0 border-r border-white/10 px-4 py-6"
        style={{ background: "#0f0a18" }}
      >
        <div className="mb-8 px-1">
          <p className="font-black text-lg tracking-tight" style={{ color: ACCENT }}>
            PlayMyJam
          </p>
          <p className="text-[#6b7280] text-xs mt-0.5">Super Admin</p>
        </div>
        <NavContent pathname={pathname} onNavigate={() => setOpen(false)} onLogout={handleLogout} />
      </aside>

      {/* Mobile top bar */}
      <header
        className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 z-30"
        style={{ background: "#0f0a18" }}
      >
        <p className="font-black text-base tracking-tight" style={{ color: ACCENT }}>
          PMJ Super Admin
        </p>
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside
            className="relative w-64 h-full flex flex-col px-4 py-6"
            style={{ background: "#0f0a18" }}
          >
            <div className="mb-8 px-1">
              <p className="font-black text-lg tracking-tight" style={{ color: ACCENT }}>
                PlayMyJam
              </p>
              <p className="text-[#6b7280] text-xs mt-0.5">Super Admin</p>
            </div>
            <NavContent pathname={pathname} onNavigate={() => setOpen(false)} onLogout={handleLogout} />
          </aside>
        </div>
      )}
    </>
  );
}
