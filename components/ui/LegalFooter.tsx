"use client";

import Link from "next/link";
import IyzicoBand from "@/components/ui/IyzicoBand";
import { useT } from "@/lib/i18n";

// YouTube API denetim şartı: gizlilik politikası ve kullanım şartları uygulama
// içinden erişilebilir olmalı, YouTube ToS bağlantısı görünür olmalı (API ToS III.A.2).
// Tosla sanal POS şartı: yasal sayfalar (mesafeli satış, teslimat-iade, hakkımızda)
// ve Visa/Mastercard/Troy logoları sitede görünür olmalı — logolar ödeme akışının
// geçtiği sayfalarda kalır; hidePayment yalnızca ödemeyle ilgisiz sayfalar için.
export default function LegalFooter({ hidePayment = false }: { hidePayment?: boolean }) {
  const t = useT();

  return (
    <footer className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-6 pb-6 pt-6">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-subtle">
        <Link href="/hakkimizda" className="hover:text-muted">
          {t.footer.about}
        </Link>
        <Link href="/iletisim" className="hover:text-muted">
          {t.nav.contact}
        </Link>
        <Link href="/privacy" className="hover:text-muted">
          {t.footer.privacy}
        </Link>
        <Link href="/terms" className="hover:text-muted">
          {t.footer.terms}
        </Link>
        <Link href="/kvkk" className="hover:text-muted">
          {t.footer.kvkk}
        </Link>
        <Link href="/ticari-ileti" className="hover:text-muted">
          {t.footer.commercialMessages}
        </Link>
        <Link href="/mesafeli-satis-sozlesmesi" className="hover:text-muted">
          {t.footer.distanceSales}
        </Link>
        <Link href="/teslimat-iade" className="hover:text-muted">
          {t.footer.delivery}
        </Link>
        <a
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-muted"
        >
          {t.footer.youtubeTerms}
        </a>
      </nav>
      {!hidePayment && <IyzicoBand />}
      <p className="text-center text-[10px] text-faint">
        {t.legalFooter.rights}{!hidePayment && t.legalFooter.sslNote}
      </p>
    </footer>
  );
}
