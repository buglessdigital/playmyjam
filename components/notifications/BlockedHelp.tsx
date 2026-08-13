"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getPermission, setNotifPref, subscribeToPush } from "@/lib/notifications";
import { useT } from "@/lib/i18n";

// İzin bir kez reddedildikten sonra sayfa tekrar izin İSTEYEMEZ — tarayıcı
// kuralı, aşılamaz. Yapabileceğimiz tek şey yolu kısaltmak:
//   1. Adımları cihaza göre yaz (kurulu uygulama / tarayıcı sekmesi / iOS / masaüstü),
//   2. Kullanıcı ayarı açıp geri döndüğünde izni kendiliğinden yeniden oku ve
//      aboneliği biz tamamla — kullanıcı ikinci kez uğraşmasın.
//
// Kurulu uygulamada (Android WebAPK) izin cihazın uygulama bildirim ayarına
// bağlıdır; oradan açılınca tarayıcı izni de "granted" olur ve bu bileşen
// dönüşte aboneliği sessizce kurar.

type Platform = "android-app" | "android-browser" | "ios" | "desktop";

function detectPlatform(): Platform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  const iOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  const android = /Android/.test(navigator.userAgent);
  if (android) return standalone ? "android-app" : "android-browser";
  return "desktop";
}

// Cihaz türü React'in dışında bir bilgi; state yerine abonelikle okunur (sunucu
// render'ı "desktop", istemcide gerçeği gelir — hidrasyon uyuşmazlığı çıkmaz).
const noopSubscribe = () => () => {};

export default function BlockedHelp({ onRecovered }: { onRecovered?: () => void }) {
  const t = useT();
  const platform = useSyncExternalStore(noopSubscribe, detectPlatform, () => "desktop" as Platform);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"blocked" | "still" | "recovered">("blocked");

  // İzin açıldıysa aboneliği tamamla. Kullanıcı ayarlardan dönünce sayfa yeniden
  // görünür olur; asıl tetikleyici bu.
  const recover = useCallback(
    async (manual: boolean) => {
      if (getPermission() !== "granted") {
        if (manual) setState("still");
        return;
      }
      if (manual) setBusy(true);
      const ok = await subscribeToPush();
      setNotifPref("push", ok);
      if (manual) setBusy(false);
      if (ok) {
        setState("recovered");
        onRecovered?.();
      } else if (manual) {
        setState("still");
      }
    },
    [onRecovered]
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") recover(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [recover]);

  if (state === "recovered") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-[#22c55e]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t.blocked.recovered}
      </p>
    );
  }

  const steps =
    platform === "android-app"
      ? t.blocked.androidApp
      : platform === "android-browser"
        ? t.blocked.androidBrowser
        : platform === "ios"
          ? t.blocked.ios
          : t.blocked.desktop;

  return (
    <div className="mt-2 rounded-xl border border-[#fbbf24]/25 bg-[#fbbf24]/[0.07] p-3">
      <p className="text-xs font-semibold text-white">{t.blocked.title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#9ca3af]">{t.blocked.intro}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[#e5e7eb]">{steps}</p>
      {state === "still" && (
        <p className="mt-2 text-[11px] text-[#fca5a5]">{t.blocked.stillBlocked}</p>
      )}
      <button
        onClick={() => recover(true)}
        disabled={busy}
        className="mt-2.5 flex h-9 w-full items-center justify-center rounded-lg text-xs font-bold text-white disabled:opacity-50"
        style={{ background: "rgba(255,255,255,0.1)" }}
      >
        {busy ? t.blocked.checking : t.blocked.recheck}
      </button>
    </div>
  );
}
