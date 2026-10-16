"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import LangToggle from "@/components/ui/LangToggle";
import ScanQrButton from "@/components/native/ScanQrButton";
import { useNativePlatform } from "@/lib/native-app";
import { useT } from "@/lib/i18n";

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff2d9c]";

// Vitrin sayfalarının ortak üst menüsü; bölüm linkleri ana sayfadaki anchor'lara gider.
//
// Görsel dil ana sayfayla aynı: düz zemin + ince çizgi, bağlantılar etiket
// (mono, büyük harf) fontunda, tek dolu pembe düğme. Mobilde tek satır: logo,
// birincil düğme ve "Menü"; geri kalan her şey tam ekran paneldedir.
//
// Mağaza uygulamasında (müşteri uygulaması) mekan sahibi bağlantıları (kayıt,
// panel girişi) çizilmez — uygulamada yeri yok, App Store incelemesini de
// karıştırır. "Mekanı Bul" yerine karekod okutma gelir, logo mekanlar listesine döner.
export default function SiteHeader() {
  const t = useT();
  const inApp = useNativePlatform() !== null;
  // Paneldeki her bağlantı tıklamada paneli kapatır (aynı sayfadaki bölüme
  // gidenler dahil), ayrıca sayfa değişimini dinlemeye gerek yok
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Panel açıkken arka plan kaymasın, Esc kapatsın
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sections = [
    { href: "/#nasil-calisir", label: t.nav.howItWorks },
    { href: "/#mekanlar", label: t.nav.forVenues },
    { href: "/#fiyatlar", label: t.nav.pricing },
    { href: "/#sss", label: t.nav.faq },
    { href: "/#iletisim", label: t.nav.contact },
  ];

  const primary = inApp ? (
    <ScanQrButton className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#e91e8c] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#ff2d9c] disabled:opacity-70 sm:px-5" />
  ) : (
    <Link
      href="/mekanlar"
      className={`shrink-0 whitespace-nowrap rounded-full bg-[#e91e8c] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#ff2d9c] sm:px-5 ${FOCUS_RING}`}
    >
      {t.nav.findVenue}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0f0a18]">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:h-[72px]">
        <Link href={inApp ? "/mekanlar" : "/"} className={`flex shrink-0 items-center rounded ${FOCUS_RING}`}>
          <Image src="/logo.png" alt="PlayMyJam" width={1600} height={500} priority className="h-9 w-auto lg:h-10" />
        </Link>

        <nav aria-label={t.nav.menu} className="hidden items-center gap-7 lg:flex">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`font-tag text-[12px] uppercase tracking-[0.14em] text-[#c7cad1] transition-colors hover:text-white ${FOCUS_RING}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden lg:block">
            <LangToggle />
          </div>
          {/* Mekan sahibi her sayfadan tek tıkla panele ve kayda ulaşsın */}
          {!inApp && (
            <>
              <Link
                href="/mekan-girisi"
                className={`hidden whitespace-nowrap text-sm font-semibold text-[#c7cad1] transition-colors hover:text-white xl:block ${FOCUS_RING}`}
              >
                {t.nav.venueLogin}
              </Link>
              <Link
                href="/mekan-kayit"
                className={`hidden whitespace-nowrap rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:border-white lg:block ${FOCUS_RING}`}
              >
                {t.nav.registerVenue}
              </Link>
            </>
          )}
          {primary}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className={`font-tag flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-3.5 text-[11px] uppercase tracking-[0.14em] text-white lg:hidden ${FOCUS_RING}`}
          >
            <span aria-hidden className="flex w-3.5 flex-col gap-[3px]">
              <span className={`h-px bg-white transition-transform ${open ? "translate-y-[4px] rotate-45" : ""}`} />
              <span className={`h-px bg-white transition-opacity ${open ? "opacity-0" : ""}`} />
              <span className={`h-px bg-white transition-transform ${open ? "-translate-y-[4px] -rotate-45" : ""}`} />
            </span>
            {open ? t.nav.close : t.nav.menu}
          </button>
        </div>
      </div>

      {/* Mobil menü paneli: başlığın altından ekranın sonuna kadar */}
      <div
        id={panelId}
        hidden={!open}
        className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto bg-[#0f0a18] lg:hidden"
      >
        <nav aria-label={t.nav.menu} className="px-5 pb-10 pt-4">
          <ul className="border-t border-white/15">
            {sections.map((s) => (
              <li key={s.href} className="border-b border-white/15">
                <Link
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className={`font-display flex min-h-14 items-center justify-between text-2xl font-bold text-white ${FOCUS_RING}`}
                >
                  {s.label}
                  <span aria-hidden className="text-[#ff8fd0]">→</span>
                </Link>
              </li>
            ))}
          </ul>

          {!inApp && (
            <>
              <p className="font-tag mt-8 text-[11px] uppercase tracking-[0.18em] text-[#9ca3af]">{t.nav.forOwners}</p>
              <div className="mt-3 flex flex-col gap-3">
                <Link
                  href="/mekan-kayit"
                  onClick={() => setOpen(false)}
                  className={`flex min-h-12 items-center justify-center rounded-full bg-white text-base font-bold text-[#0f0a18] ${FOCUS_RING}`}
                >
                  {t.nav.registerVenue}
                </Link>
                <Link
                  href="/mekan-girisi"
                  onClick={() => setOpen(false)}
                  className={`flex min-h-12 items-center justify-center rounded-full border border-white/25 text-base font-bold text-white ${FOCUS_RING}`}
                >
                  {t.nav.venueLogin}
                </Link>
              </div>
            </>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-white/15 pt-6">
            <span className="font-tag text-[11px] uppercase tracking-[0.18em] text-[#9ca3af]">{t.lang.label}</span>
            <LangToggle />
          </div>
        </nav>
      </div>
    </header>
  );
}
