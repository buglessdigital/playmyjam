"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

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
    href: `/admin/${venueId}/requests`,
    label: "İstekler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: `/admin/${venueId}/stats`,
    label: "İstatistikler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: `/admin/${venueId}/settings`,
    label: "Ayarlar",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

interface Props {
  venueId: string;
}

// Daraltma tercihi cihazda kalsın: her açılışta yeniden daraltmak zorunda kalınmasın.
// localStorage bir dış kaynak olduğu için state yerine abonelikle okunur —
// sunucu render'ı her zaman "geniş" olur, hidrasyon uyuşmazlığı çıkmaz.
const COLLAPSE_KEY = "pmj-admin-sidebar-collapsed";
const collapseListeners = new Set<() => void>();

const subscribeCollapsed = (cb: () => void) => {
  collapseListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    collapseListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

const readCollapsed = () => localStorage.getItem(COLLAPSE_KEY) === "1";

const writeCollapsed = (value: boolean) => {
  localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  collapseListeners.forEach((cb) => cb());
};

function NavContent({
  venueId,
  pathname,
  collapsed,
  onNavigate,
}: {
  venueId: string;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const items = navItems(venueId);

  // Ana ekran yalnızca tam eşleşmede etkin — kökü her alt sayfa da kapsardı.
  // Diğerlerinde alt yollar da sayılır (örn. /settings/...).
  const root = `/admin/${venueId}`;
  const isActive = (href: string) =>
    href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={`flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all ${collapsed ? "justify-center px-0" : "px-3"}`}
          style={{
            color: isActive(item.href) ? "#e91e8c" : "#9ca3af",
            background: isActive(item.href) ? "rgba(233,30,140,0.1)" : "transparent",
          }}
        >
          {item.icon}
          {!collapsed && item.label}
        </Link>
      ))}
    </nav>
  );
}

export default function AdminSidebar({ venueId }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  const toggleCollapsed = () => writeCollapsed(!collapsed);

  return (
    <>
      {/* Masaüstü kenar çubuğu — daraltılınca yalnızca simgeler kalır */}
      <aside
        className={`hidden md:flex flex-col h-dvh shrink-0 border-r border-white/10 py-6 transition-[width] duration-200 ${collapsed ? "w-[76px] px-3" : "w-[240px] px-4"}`}
        style={{ background: "#0f0a18" }}
      >
        <div className={`mb-8 flex items-center gap-2 ${collapsed ? "flex-col" : "px-1 justify-between"}`}>
          {collapsed ? (
            <Image src="/logo-mark.png" alt="PlayMyJam" width={500} height={500} priority className="h-8 w-8 object-contain" />
          ) : (
            <div className="min-w-0">
              <Image src="/logo.png" alt="PlayMyJam" width={1600} height={500} priority className="h-11 w-auto object-contain" />
              <p className="text-[#6b7280] text-xs mt-1.5">Admin Paneli</p>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-colors hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: collapsed ? "rotate(180deg)" : undefined }}>
              <path d="M15 6l-6 6 6 6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <NavContent venueId={venueId} pathname={pathname} collapsed={collapsed} onNavigate={() => setOpen(false)} />
      </aside>

      {/* Mobil üst bar */}
      <header
        className="md:hidden flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 z-30"
        style={{ background: "#0f0a18" }}
      >
        <Image src="/logo.png" alt="PlayMyJam" width={1600} height={500} priority className="h-9 w-auto object-contain" />
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ background: "rgba(255,255,255,0.08)" }}
          aria-label="Menü"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Mobil çekmece */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative w-64 h-full flex flex-col px-4 py-6" style={{ background: "#0f0a18" }}>
            <div className="mb-8 px-1">
              <Image src="/logo.png" alt="PlayMyJam" width={1600} height={500} className="h-11 w-auto object-contain" />
              <p className="text-[#6b7280] text-xs mt-1.5">Admin Paneli</p>
            </div>
            <NavContent venueId={venueId} pathname={pathname} collapsed={false} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
