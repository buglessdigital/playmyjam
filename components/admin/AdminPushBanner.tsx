"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ADMIN_PUSH_ENDPOINT,
  getPermission,
  isPushSupported,
  subscribeToPush,
} from "@/lib/notifications";

// Mekan admininin telefonuna talep bildirimi düşebilmesi için abonelik kartı.
//
// iOS özel durumu: Safari web push'u YALNIZCA ana ekrana eklenmiş (standalone)
// uygulamada verir. Tarayıcı sekmesinde açıkken izin isteme düğmesi hiç
// çalışmayacağı için kullanıcıya doğrudan "ana ekrana ekle" yönergesi gösterilir.

type Detected = "ios-install" | "unsupported" | "denied" | "granted" | "ready";

const noopSubscribe = () => () => {};

function needsHomeScreen(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  return isIOS && !standalone;
}

// Önce YETENEĞE bakılır, cihaz markasına değil: push API'leri varsa düğme
// gösterilir ve tek dokunuşla izin istenir. "Ana ekrana ekle" yönergesi ancak
// deneme gerçekten başarısız olursa çıkar.
function detect(): Detected {
  if (isPushSupported()) {
    const permission = getPermission();
    if (permission === "denied") return "denied";
    if (permission === "granted") return "granted";
    return "ready";
  }
  // API'ler yok: iOS'ta ana ekrana eklenince gelirler, o yüzden düğme dursun
  return needsHomeScreen() ? "ready" : "unsupported";
}

export default function AdminPushBanner() {
  // Tarayıcı yeteneği sunucuda bilinemez: sunucu anlık görüntüsü "unsupported"
  // (kart hiç çizilmez), istemcide gerçek durumla değişir
  const detected = useSyncExternalStore<Detected>(noopSubscribe, detect, () => "unsupported");
  const [override, setOverride] = useState<"on" | "ready" | "denied" | "ios-install" | null>(null);
  const [busy, setBusy] = useState(false);

  // İzin verilmiş olsa bile abonelik bu cihazda sunucuya kayıtlı olmayabilir
  // (ör. tarayıcı verisi temizlenmiş) — kaydı sessizce tazele.
  useEffect(() => {
    if (detected !== "granted") return;
    let cancelled = false;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (cancelled) return;
        if (!sub) {
          setOverride("ready");
          return;
        }
        const res = await fetch(ADMIN_PUSH_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        if (!cancelled) setOverride(res.ok ? "on" : "ready");
      })
      .catch(() => {
        if (!cancelled) setOverride("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [detected]);

  const state = override ?? (detected === "granted" ? "on" : detected);

  const enable = async () => {
    setBusy(true);
    const ok = await subscribeToPush(ADMIN_PUSH_ENDPOINT);
    setBusy(false);
    if (ok) return setOverride("on");
    // Neden olmadı: izin reddedildi mi, yoksa cihazda API'ler yok mu?
    setOverride(needsHomeScreen() && !isPushSupported() ? "ios-install" : "denied");
  };

  if (state === "on" || state === "unsupported") return null;

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
            Müşteri şarkı talebi gönderdiğinde telefonuna bildirim düşer; paneli açmadan
            bildirim üstünden onaylayıp reddedebilirsin.
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
