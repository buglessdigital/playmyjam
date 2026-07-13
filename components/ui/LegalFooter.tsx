import Link from "next/link";

// YouTube API denetim şartı: gizlilik politikası ve kullanım şartları uygulama
// içinden erişilebilir olmalı, YouTube ToS bağlantısı görünür olmalı (API ToS III.A.2)
export default function LegalFooter() {
  return (
    <footer className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 pb-4 pt-6 text-[11px] text-[#6b7280]">
      <Link href="/privacy" className="hover:text-[#9ca3af]">
        Gizlilik Politikası
      </Link>
      <Link href="/terms" className="hover:text-[#9ca3af]">
        Kullanım Şartları
      </Link>
      <a
        href="https://www.youtube.com/t/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-[#9ca3af]"
      >
        YouTube Hizmet Şartları
      </a>
    </footer>
  );
}
