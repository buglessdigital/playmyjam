import Link from "next/link";
import CardLogos from "@/components/ui/CardLogos";

// YouTube API denetim şartı: gizlilik politikası ve kullanım şartları uygulama
// içinden erişilebilir olmalı, YouTube ToS bağlantısı görünür olmalı (API ToS III.A.2).
// Tosla sanal POS şartı: yasal sayfalar (mesafeli satış, teslimat-iade, hakkımızda)
// ve Visa/Mastercard/Troy logoları sitede görünür olmalı — logolar ödeme akışının
// geçtiği sayfalarda kalır; hidePayment yalnızca ödemeyle ilgisiz sayfalar için.
export default function LegalFooter({ hidePayment = false }: { hidePayment?: boolean }) {
  return (
    <footer className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-6 pb-6 pt-6">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[#6b7280]">
        <Link href="/hakkimizda" className="hover:text-[#9ca3af]">
          Hakkımızda
        </Link>
        <Link href="/iletisim" className="hover:text-[#9ca3af]">
          İletişim
        </Link>
        <Link href="/privacy" className="hover:text-[#9ca3af]">
          Gizlilik Politikası
        </Link>
        <Link href="/terms" className="hover:text-[#9ca3af]">
          Kullanım Şartları
        </Link>
        <Link href="/mesafeli-satis-sozlesmesi" className="hover:text-[#9ca3af]">
          Mesafeli Satış Sözleşmesi
        </Link>
        <Link href="/teslimat-iade" className="hover:text-[#9ca3af]">
          Teslimat ve İade
        </Link>
        <a
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#9ca3af]"
        >
          YouTube Hizmet Şartları
        </a>
      </nav>
      {!hidePayment && <CardLogos />}
      <p className="text-center text-[10px] text-[#4b5563]">
        © 2026 PlayMyJam{!hidePayment && " · Tüm ödemeler SSL ile güvence altındadır."}
      </p>
    </footer>
  );
}
