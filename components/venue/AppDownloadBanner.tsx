"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { isNativeApp } from "@/lib/native-app";
import { trackAction } from "@/lib/ui-track";
import { useT } from "@/lib/i18n";

// Mobil tarayıcıdaki müşteriyi mağaza uygulamasına çağıran şerit:
// "Uygulamayı indir, 1 jeton hediye" (hediye kuralları: 0076, lib/app-gift.ts).
//
// Mağaza adresleri env'den gelir; o platformun adresi tanımlı değilse şerit
// HİÇ çıkmaz — uygulama yayına girene kadar bu bileşen etkisiz.
// Uygulamanın kendi içinde (Capacitor) ve masaüstünde görünmez.

const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? "";
const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? "";

const DISMISS_KEY = "pmj-app-banner-dismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // kapatıldıysa bir hafta sorma

function storeUrlForDevice(): string | null {
  const ua = navigator.userAgent;
  // iPadOS 13+ kendini Mac olarak tanıtıyor; dokunmatik Mac yok
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return APP_STORE_URL || null;
  if (/Android/.test(ua)) return PLAY_STORE_URL || null;
  return null;
}

function dismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw !== null && Date.now() - Number(raw) < DISMISS_MS;
  } catch {
    return false;
  }
}

export default function AppDownloadBanner() {
  const t = useT();
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!APP_STORE_URL && !PLAY_STORE_URL) return;
    if (isNativeApp() || dismissed()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tarayıcıya bağlı, sunucuda bilinemez
    setStoreUrl(storeUrlForDevice());
  }, []);

  if (!storeUrl) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // gizli kip: bu oturumda kapanması yeter
    }
    setStoreUrl(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-3 border-b border-white/10 bg-[#170e25] px-4 py-2.5">
      <Image src="/icon-192.png" alt="" width={36} height={36} className="shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-white">{t.nativeApp.bannerTitle}</p>
        <p className="truncate text-[11px] text-[#c4b5d4]">{t.nativeApp.bannerBody}</p>
      </div>
      <a
        href={storeUrl}
        onClick={() => trackAction("app_banner_click")}
        className="shrink-0 rounded-full bg-[#e91e8c] px-3.5 py-1.5 text-[12px] font-bold text-white"
      >
        {t.nativeApp.bannerCta}
      </a>
      <button
        type="button"
        onClick={close}
        aria-label={t.nativeApp.bannerClose}
        className="-mr-1 shrink-0 p-1 text-[#6b7280]"
      >
        <X size={16} />
      </button>
    </div>
  );
}
