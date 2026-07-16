import Link from "next/link";
import Coin from "@/components/ui/Coin";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

// Vitrin sayfalarının ortak üst menüsü; bölüm linkleri ana sayfadaki anchor'lara gider.
export default function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/[0.06]"
      style={{ background: "rgba(15,10,24,0.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Coin size={26} />
          <span className="text-lg font-black tracking-tight text-white">PlayMyJam</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-[#9ca3af] md:flex">
          <Link href="/#nasil-calisir" className="transition-colors hover:text-white">Nasıl Çalışır</Link>
          <Link href="/#mekanlar" className="transition-colors hover:text-white">Mekanlar İçin</Link>
          <Link href="/#fiyatlar" className="transition-colors hover:text-white">Fiyatlar</Link>
          <Link href="/#sss" className="transition-colors hover:text-white">SSS</Link>
          <Link href="/#iletisim" className="transition-colors hover:text-white">İletişim</Link>
        </nav>
        <Link
          href="/mekanlar"
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.97]"
          style={{ background: PINK_GRADIENT, boxShadow: "0 6px 20px -6px rgba(233,30,140,0.5)" }}
        >
          Mekanı Bul
        </Link>
      </div>
    </header>
  );
}
