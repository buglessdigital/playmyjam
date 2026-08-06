"use client";

import Link from "next/link";
import Image from "next/image";
import LangToggle from "@/components/ui/LangToggle";
import { useT } from "@/lib/i18n";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

// Vitrin sayfalarının ortak üst menüsü; bölüm linkleri ana sayfadaki anchor'lara gider.
export default function SiteHeader() {
  const t = useT();

  return (
    <header
      className="sticky top-0 z-40 border-b border-white/[0.06]"
      style={{ background: "rgba(15,10,24,0.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-24 sm:gap-6 sm:px-6">
        <Link href="/" className="relative z-10 flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="PlayMyJam"
            width={1600}
            height={500}
            priority
            className="h-11 w-auto drop-shadow-[0_0_12px_rgba(233,30,140,0.25)]"
          />
        </Link>
        <nav className="hidden items-center gap-7 text-[15px] font-semibold tracking-wide text-[#c7cad1] lg:flex">
          <Link href="/#nasil-calisir" className="transition-colors hover:text-[#ff2d9c]">{t.nav.howItWorks}</Link>
          <Link href="/#mekanlar" className="transition-colors hover:text-[#ff2d9c]">{t.nav.forVenues}</Link>
          <Link href="/#fiyatlar" className="transition-colors hover:text-[#ff2d9c]">{t.nav.pricing}</Link>
          <Link href="/#sss" className="transition-colors hover:text-[#ff2d9c]">{t.nav.faq}</Link>
          <Link href="/#iletisim" className="transition-colors hover:text-[#ff2d9c]">{t.nav.contact}</Link>
          {/* Mekan sahibi panele her sayfadan ulaşsın */}
          <Link href="/mekan-girisi" className="transition-colors hover:text-[#ff2d9c]">{t.nav.venueLogin}</Link>
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Mobilde dil anahtarı ve mekan kayıt linki alt satıra taşınıyor, üst satır taşmasın */}
          <div className="hidden sm:block">
            <LangToggle />
          </div>
          {/* Mekan sahibi her sayfadan tek dokunuşla kayıt formuna ulaşsın */}
          <Link
            href="/#mekan-basvuru"
            className="hidden whitespace-nowrap rounded-xl border border-[#e91e8c]/30 px-4 py-2.5 text-sm font-bold text-[#ff8fd0] transition-colors hover:bg-[#e91e8c]/10 sm:block"
            style={{ background: "rgba(233,30,140,0.06)" }}
          >
            {t.nav.registerVenue}
          </Link>
          <Link
            href="/mekanlar"
            className="shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.97] sm:px-4"
            style={{ background: PINK_GRADIENT, boxShadow: "0 6px 20px -6px rgba(233,30,140,0.5)" }}
          >
            {t.nav.findVenue}
          </Link>
        </div>
      </div>
      {/* Mobil: dil anahtarı + mekan kaydı/girişi üst menünün altında kendi satırında */}
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] px-4 py-2 sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/#mekan-basvuru"
            className="truncate rounded-lg border border-[#e91e8c]/30 px-3 py-1.5 text-[11px] font-bold text-[#ff8fd0]"
            style={{ background: "rgba(233,30,140,0.06)" }}
          >
            {t.nav.registerVenue}
          </Link>
          <Link
            href="/mekan-girisi"
            className="truncate rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-[#9ca3af]"
          >
            {t.nav.venueLogin}
          </Link>
        </div>
        <div className="shrink-0">
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
