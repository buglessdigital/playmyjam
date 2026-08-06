"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Kurtarma hesabı bağlı değilse panelin üstünde kalıcı hatırlatma. Kullanımı
// engellemez — bağlamadan şifresini unutan admin'in tek yolu super admin'e
// yazmak olduğu için uyarı kapatılamaz da.
export default function GoogleLinkBanner({ venueId }: { venueId: string }) {
  const pathname = usePathname();
  const [needsLink, setNeedsLink] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/credentials")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((a: { googleEmail: string | null }) => {
        if (active) setNeedsLink(!a.googleEmail);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  // Ayarlar sayfasında zaten kartın kendisi duruyor
  if (!needsLink || pathname.endsWith("/settings")) return null;

  return (
    <div
      className="px-4 py-2.5 text-xs flex flex-wrap items-center gap-x-2 gap-y-1"
      style={{ background: "rgba(245,158,11,0.1)", borderBottom: "1px solid rgba(245,158,11,0.25)" }}
    >
      <span className="text-amber-300">
        Google hesabınız bağlı değil — şifrenizi unutursanız sıfırlama bağlantısı gönderemeyiz.
      </span>
      <Link
        href={`/admin/${venueId}/settings`}
        className="text-white font-semibold underline underline-offset-4"
      >
        Şimdi bağla
      </Link>
    </div>
  );
}
