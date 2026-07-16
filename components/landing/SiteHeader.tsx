import Link from "next/link";
import Image from "next/image";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

// Vitrin sayfalarının ortak üst menüsü; bölüm linkleri ana sayfadaki anchor'lara gider.
export default function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/[0.06]"
      style={{ background: "rgba(15,10,24,0.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="relative z-10 flex shrink-0 items-center">
          <Image
            src="/logo-hero.png"
            alt="PlayMyJam"
            width={1200}
            height={1013}
            priority
            className="h-[5.5rem] w-auto drop-shadow-[0_0_12px_rgba(233,30,140,0.25)]"
          />
        </Link>
        <nav className="hidden items-center gap-8 text-[15px] font-semibold tracking-wide text-[#c7cad1] md:flex">
          <Link href="/#nasil-calisir" className="transition-colors hover:text-[#ff2d9c]">Nasıl Çalışır</Link>
          <Link href="/#mekanlar" className="transition-colors hover:text-[#ff2d9c]">Mekanlar İçin</Link>
          <Link href="/#fiyatlar" className="transition-colors hover:text-[#ff2d9c]">Fiyatlar</Link>
          <Link href="/#sss" className="transition-colors hover:text-[#ff2d9c]">SSS</Link>
          <Link href="/#iletisim" className="transition-colors hover:text-[#ff2d9c]">İletişim</Link>
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
