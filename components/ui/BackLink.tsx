"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useNativePlatform } from "@/lib/native-app";

// Alt sayfalardaki "Geri" düğmesi. Siteden gelindiyse tarayıcı geçmişinde bir
// adım geri gider (kullanıcı kaldığı kaydırma konumuna döner); doğrudan bağlantı
// ya da başka siteden gelindiyse fallback'e (varsayılan ana sayfa) gider.
// Gerçek bir <a> olduğu için JS yüklenmeden de, yeni sekmede açmada da çalışır.
//
// hideInApp: mağaza uygulamasında /mekanlar açılış ekranı; oradan "geri" vitrine
// götürmesin.
export default function BackLink({
  fallback = "/",
  className = "",
  hideInApp = false,
}: {
  fallback?: string;
  className?: string;
  hideInApp?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const inApp = useNativePlatform() !== null;

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    // Siteden mi gelindi? İki yol: sayfa siteden tam yüklemeyle açıldı (referrer)
    // ya da istemci tarafı gezinmeyle geldi (adres, belgenin ilk yüklendiği
    // adresten farklı — Next Link geçişlerinde referrer değişmez).
    let cameFromSite = false;
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const clientNav = !!nav && nav.name !== window.location.href;
      const sameOrigin = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
      cameFromSite = clientNav || sameOrigin;
    } catch {
      // bozuk referrer — fallback'e git
    }
    if (cameFromSite && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  };

  if (hideInApp && inApp) return null;

  return (
    <Link
      href={fallback}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-sm font-semibold text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff2d9c] ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {t.nav.back}
    </Link>
  );
}
