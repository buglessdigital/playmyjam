import Link from "next/link";
import Image from "next/image";
import IyzicoBand from "@/components/ui/IyzicoBand";
import { COMPANY } from "@/lib/company-info";

// Vitrin sayfalarının ortak tam footer'ı (ödeme kuruluşu şartları: yasal linkler + kart logoları)
export default function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06]" style={{ background: "#0c0814" }}>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="inline-flex items-center">
            <Image src="/logo.png" alt="PlayMyJam" width={900} height={759} className="h-16 w-auto" />
          </div>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-[#6b7280]">
            Kafe ve eğlence mekanlarında müzik sırasını misafirlere açan dijital şarkı istek
            platformu. {COMPANY.legalName} tarafından işletilmektedir.
          </p>
          <div className="mt-5">
            <IyzicoBand />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">Ürün</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li><Link href="/mekanlar" className="hover:text-white">Mekanlar</Link></li>
            <li><Link href="/#nasil-calisir" className="hover:text-white">Nasıl Çalışır</Link></li>
            <li><Link href="/#fiyatlar" className="hover:text-white">Fiyatlar</Link></li>
            <li><Link href="/#sss" className="hover:text-white">Sık Sorulan Sorular</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">Yasal</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li><Link href="/hakkimizda" className="hover:text-white">Hakkımızda</Link></li>
            <li><Link href="/privacy" className="hover:text-white">Gizlilik Politikası</Link></li>
            <li><Link href="/terms" className="hover:text-white">Kullanım Şartları</Link></li>
            <li><Link href="/mesafeli-satis-sozlesmesi" className="hover:text-white">Mesafeli Satış Sözleşmesi</Link></li>
            <li><Link href="/teslimat-iade" className="hover:text-white">Teslimat ve İade</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">İletişim</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li>
              <a href={`mailto:${COMPANY.email}`} className="hover:text-white">{COMPANY.email}</a>
            </li>
            <li>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="hover:text-white">{COMPANY.phone}</a>
            </li>
            <li className="leading-relaxed">{COMPANY.address}</li>
            <li><Link href="/iletisim" className="text-[#e91e8c] hover:text-[#ff2d9c]">İletişim sayfası →</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[11px] text-[#4b5563]">
          <p>© 2026 PlayMyJam · Tüm hakları saklıdır · Tüm ödemeler SSL ile güvence altındadır</p>
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#9ca3af]"
          >
            YouTube Hizmet Şartları
          </a>
        </div>
      </div>
    </footer>
  );
}
