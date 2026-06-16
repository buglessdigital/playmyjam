"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  venueId: string;
}

export default function BottomNav({ venueId }: BottomNavProps) {
  const pathname = usePathname();

  const tabs = [
    {
      label: "KUYRUK",
      segment: "queue",
      href: `/venue/${venueId}/queue`,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="2" rx="1" fill={active ? "#e91e8c" : "#6b7280"} />
          <rect x="3" y="10" width="14" height="2" rx="1" fill={active ? "#e91e8c" : "#6b7280"} />
          <rect x="3" y="15" width="10" height="2" rx="1" fill={active ? "#e91e8c" : "#6b7280"} />
          <circle cx="20" cy="15" r="3" stroke={active ? "#e91e8c" : "#6b7280"} strokeWidth="1.5" />
          <path d="M20 12v3" stroke={active ? "#e91e8c" : "#6b7280"} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "GÖZAT",
      segment: "browse",
      href: `/venue/${venueId}/browse`,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke={active ? "#e91e8c" : "#6b7280"} strokeWidth="2" />
          <path d="M20 20l-3-3" stroke={active ? "#e91e8c" : "#6b7280"} strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "PROFİL",
      segment: "profile",
      href: `/venue/${venueId}/profile`,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke={active ? "#e91e8c" : "#6b7280"} strokeWidth="2" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={active ? "#e91e8c" : "#6b7280"} strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/10 backdrop-blur-md h-16"
      style={{ background: "rgba(15,10,24,0.96)" }}
    >
      {tabs.map((tab) => {
        const active = pathname.includes(`/${tab.segment}`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full"
          >
            {tab.icon(active)}
            <span
              className="text-[10px] font-semibold tracking-wider"
              style={{ color: active ? "#e91e8c" : "#6b7280" }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
