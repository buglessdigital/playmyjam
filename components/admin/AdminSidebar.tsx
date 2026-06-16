"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = (venueId: string) => [
  {
    href: `/admin/${venueId}`,
    label: "Ana Ekran",
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
    href: `/admin/${venueId}/playlist`,
    label: "Playlist",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: `/admin/${venueId}/requests`,
    label: "İstekler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: `/admin/${venueId}/tokens`,
    label: "Jeton Fiyatları",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v10M9.5 9.5C9.5 8.4 10.6 8 12 8s2.5.5 2.5 2-1.5 2-2.5 2-2.5.5-2.5 2 1.1 2 2.5 2 2.5-.4 2.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

interface Props {
  venueId: string;
}

function NavContent({
  venueId,
  pathname,
  onNavigate,
}: {
  venueId: string;
  pathname: string;
  onNavigate: () => void;
}) {
  const items = navItems(venueId);

  const isActive = (href: string) =>
    href === `/admin/${venueId}` ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            color: isActive(item.href) ? "#e91e8c" : "#9ca3af",
            background: isActive(item.href) ? "rgba(233,30,140,0.1)" : "transparent",
          }}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default function AdminSidebar({ venueId }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col h-screen sticky top-0 w-[240px] shrink-0 border-r border-white/10 px-4 py-6"
        style={{ background: "#0f0a18" }}
      >
        <div className="mb-8 px-1">
          <p className="text-[#e91e8c] font-black text-lg tracking-tight">PlayMyJam</p>
          <p className="text-[#6b7280] text-xs mt-0.5">Admin Paneli</p>
        </div>
        <NavContent venueId={venueId} pathname={pathname} onNavigate={() => setOpen(false)} />
      </aside>

      {/* Mobile top bar */}
      <header
        className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 z-30"
        style={{ background: "#0f0a18" }}
      >
        <p className="text-[#e91e8c] font-black text-base tracking-tight">PlayMyJam Admin</p>
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
              <p className="text-[#e91e8c] font-black text-lg tracking-tight">PlayMyJam</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Admin Paneli</p>
            </div>
            <NavContent venueId={venueId} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
