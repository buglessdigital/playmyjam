"use client";

import { useEffect, useState } from "react";
import {
  ADMIN_PUSH_ENDPOINT,
  getPermission,
  isPushSupported,
  subscribeToPush,
} from "@/lib/notifications";

// Mekan admininin telefonuna talep bildirimi düşebilmesi için abonelik kartı.
//
// Karar TARAYICI İZNİNE değil, GERÇEK ABONELİĞE bakar: izin verilmiş olması
// bildirimin geleceği anlamına gelmiyor — abonelik sunucuya ulaşmamış olabilir.
// O durumda düğme yine görünür ve tek dokunuşla kayıt tamamlanır.
//
// iOS: Safari web push'u yalnızca ana ekrana eklenmiş uygulamada verir; API'ler
// sekmede hiç yok. Yönerge, deneme başarısız olunca gösterilir.

type State = "checking" | "ready" | "on" | "unsupported" | "ios-install" | "denied" | "failed";

function needsHomeScreen(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  return isIOS && !standalone;
}

// Tarayıcıdaki abonelik sunucuda da kayıtlı mı? (silent: doğrulama bildirimi atma)
async function registeredOnServer(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    const res = await fetch(ADMIN_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), silent: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function AdminPushBanner() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setState(needsHomeScreen() ? "ready" : "unsupported");
        return;
      }
      const permission = getPermission();
      if (permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      if (permission !== "granted") {
        if (!cancelled) setState("ready");
        return;
      }
      const ok = await registeredOnServer();
      if (!cancelled) setState(ok ? "on" : "ready");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    const ok = await subscribeToPush(ADMIN_PUSH_ENDPOINT);
    setBusy(false);
    if (ok) return setState("on");
    if (getPermission() === "denied") return setState("denied");
    setState(needsHomeScreen() && !isPushSupported() ? "ios-install" : "failed");
  };

  // "Açık" yazıyor ama bildirim gelmiyorsa admin kendi sınayabilsin
  const test = async () => {
    setBusy(true);
    await subscribeToPush(ADMIN_PUSH_ENDPOINT);
    setBusy(false);
  };

  if (state === "checking" || state === "unsupported") return null;

  if (state === "on") {
    return (
      <div className="mb-5 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-[#9ca3af]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Talep bildirimleri bu cihazda açık
        </p>
        <button
          onClick={test}
          disabled={busy}
          className="shrink-0 text-xs font-semibold text-[#e91e8c] disabled:opacity-50"
        >
          {busy ? "..." : "Sına"}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl border border-[#fbbf24]/25 bg-[#fbbf24]/[0.07] px-4 py-3.5">
      <p className="text-sm font-semibold text-white">Talep bildirimlerini aç</p>
      {state === "ios-install" ? (
        <p className="mt-1 text-xs text-[#9ca3af]">
          iPhone&apos;da bildirim alabilmek için paneli ana ekrana eklemen gerekiyor:
          Safari&apos;de <span className="text-white">Paylaş → Ana Ekrana Ekle</span>, sonra
          uygulamayı ana ekrandan açıp bu düğmeye bas.
        </p>
      ) : state === "denied" ? (
        <p className="mt-1 text-xs text-[#9ca3af]">
          Bildirim izni bu cihazda engellenmiş. Tarayıcı ayarlarından PlayMyJam için
          bildirimlere izin verip sayfayı yenile.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-[#9ca3af]">
            {state === "failed"
              ? "Bildirim kaydı tamamlanamadı. Bağlantını kontrol edip tekrar dene."
              : "Müşteri şarkı talebi gönderdiğinde telefonuna bildirim düşer; paneli açmadan bildirim üstünden onaylayıp reddedebilirsin."}
          </p>
          <button
            onClick={enable}
            disabled={busy}
            className="mt-3 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            {busy ? "Açılıyor..." : "Bildirimleri Aç"}
          </button>
        </>
      )}
    </div>
  );
}
