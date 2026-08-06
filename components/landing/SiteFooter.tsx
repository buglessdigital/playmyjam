"use client";

import Link from "next/link";
import Image from "next/image";
import IyzicoBand from "@/components/ui/IyzicoBand";
import LangToggle from "@/components/ui/LangToggle";
import { COMPANY } from "@/lib/company-info";
import { fmt, useT } from "@/lib/i18n";

// Vitrin sayfalarının ortak tam footer'ı (ödeme kuruluşu şartları: yasal linkler + kart logoları)
export default function SiteFooter() {
  const t = useT();

  return (
    <footer className="border-t border-white/[0.06]" style={{ background: "#0c0814" }}>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="inline-flex items-center">
            <Image src="/logo.png" alt="PlayMyJam" width={1600} height={500} className="h-10 w-auto" />
          </div>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-[#6b7280]">
            {fmt(t.footer.tagline, { company: COMPANY.legalName })}
          </p>
          <div className="mt-5">
            <IyzicoBand />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">{t.footer.product}</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li><Link href="/mekanlar" className="hover:text-white">{t.footer.venues}</Link></li>
            <li><Link href="/#nasil-calisir" className="hover:text-white">{t.nav.howItWorks}</Link></li>
            <li><Link href="/#fiyatlar" className="hover:text-white">{t.nav.pricing}</Link></li>
            <li><Link href="/#sss" className="hover:text-white">{t.footer.faqLong}</Link></li>
            <li><Link href="/#mekan-basvuru" className="text-[#e91e8c] hover:text-[#ff2d9c]">{t.nav.registerVenue}</Link></li>
            <li><Link href="/mekan-girisi" className="hover:text-white">{t.footer.venueLogin}</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">{t.footer.legal}</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li><Link href="/hakkimizda" className="hover:text-white">{t.footer.about}</Link></li>
            <li><Link href="/privacy" className="hover:text-white">{t.footer.privacy}</Link></li>
            <li><Link href="/terms" className="hover:text-white">{t.footer.terms}</Link></li>
            <li><Link href="/mesafeli-satis-sozlesmesi" className="hover:text-white">{t.footer.distanceSales}</Link></li>
            <li><Link href="/teslimat-iade" className="hover:text-white">{t.footer.delivery}</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">{t.nav.contact}</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li>
              <a href={`mailto:${COMPANY.email}`} className="hover:text-white">{COMPANY.email}</a>
            </li>
            <li>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="hover:text-white">{COMPANY.phone}</a>
            </li>
            <li className="leading-relaxed">{COMPANY.address}</li>
            <li><Link href="/iletisim" className="text-[#e91e8c] hover:text-[#ff2d9c]">{t.footer.contactPage}</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[11px] text-[#4b5563]">
          <p>{t.footer.rights}</p>
          <div className="flex items-center gap-4">
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#9ca3af]"
            >
              {t.footer.youtubeTerms}
            </a>
            <LangToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
