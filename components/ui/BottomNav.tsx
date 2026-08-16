"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useVenueGate } from "@/lib/venue-gate";
import {
  hydrateTokenBalanceFromCache,
  publishTokenBalance,
  useTokenBalance,
} from "@/lib/token-balance-store";
import { useT } from "@/lib/i18n";

interface BottomNavProps {
  venueId: string;
}

export default function BottomNav({ venueId }: BottomNavProps) {
  const pathname = usePathname();
  const { isMember, requireAccount } = useVenueGate(venueId);
  const supabase = useMemo(() => createClient(), []);
  const balance = useTokenBalance();
  const t = useT();

  // Bakiyeyi normalde sayfalar yayınlar (kendi durum RPC'lerinden). Tam
  // yenilemeden sonra hiçbiri konuşmamışsa rozet boş kalmasın diye tek satırlık
  // cüzdan sorgusu burada bir kez yapılır.
  useEffect(() => {
    if (!isMember) return;
    hydrateTokenBalanceFromCache();

    let cancelled = false;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("user_wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      publishTokenBalance(data.balance as number);
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [isMember, supabase]);

  const tabs = [
    {
      label: t.panelNav.queue,
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
      label: t.panelNav.browse,
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
      // Yeni kullanıcının takıldığı yer jeton almaktı: profil menüsünün altından
      // çıkarılıp alt gezinmeye alındı. Profil artık sayfa başlıklarının sağ üstünde.
      // ?tab=1: jeton sayfası sekmeden açıldığını bilsin (geri okunu göstermez).
      label: t.panelNav.tokens,
      segment: "tokens",
      href: `/venue/${venueId}/tokens?tab=1`,
      // Satın alma hesaba bağlı — misafir önce giriş ekranına gider
      requiresAccount: true,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke={active ? "#fbbf24" : "#6b7280"} strokeWidth="2" />
          <circle cx="12" cy="12" r="3.5" stroke={active ? "#fbbf24" : "#6b7280"} strokeWidth="1.6" />
          <path d="M12 8.5v-3M12 18.5v-3" stroke={active ? "#fbbf24" : "#6b7280"} strokeWidth="1.6" strokeLinecap="round" />
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
        // Sayı yerine yalnızca "bakiyen bitti" noktası: rakam kalabalık duruyordu,
        // asıl anlatılmak istenen zaten sıfır bakiye. Misafirde yok — onun
        // cüzdanı değil, giriş adımı eksik.
        const showBadge = tab.segment === "tokens" && isMember && balance === 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={(e) => {
              if (tab.requiresAccount && !requireAccount(tab.href)) e.preventDefault();
            }}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full"
          >
            <span className="relative">
              {tab.icon(active)}
              {showBadge && (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-[#0f0a18]"
                  style={{ background: "#e91e8c" }}
                />
              )}
            </span>
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
