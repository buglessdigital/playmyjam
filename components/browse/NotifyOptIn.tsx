"use client";

import { useState, useSyncExternalStore } from "react";
import { getPermission, isPushSupported, subscribeToPush } from "@/lib/notifications";
import { useT } from "@/lib/i18n";

// Talep gönderildikten sonraki isteğe bağlı adım: onay bildirimi için izin.
// Talep izinden BAĞIMSIZ olarak zaten iletildi — burada sadece "onaylanırsa
// haberin olsun" teklifi var, çünkü onay sonrası çalma penceresi 10 dakika.
//
// iOS: Safari web push'u yalnızca ana ekrana eklenmiş uygulamada verir; sekmede
// izin istemek sonuçsuz kalacağı için doğrudan yönerge gösterilir.

type NotifyState = "idle" | "on" | "hidden" | "ios" | "denied";

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
// deneme gerçekten başarısız olursa çıkar — kimse gereksiz yere uğraşmasın.
function detectNotifyState(): NotifyState {
  if (isPushSupported()) {
    const permission = getPermission();
    if (permission === "granted") return "on";
    if (permission === "denied") return "denied";
    return "idle";
  }
  // API'ler yok: iOS'ta ana ekrana eklenince gelirler, o yüzden düğme dursun
  return needsHomeScreen() ? "idle" : "hidden";
}

export default function NotifyOptIn() {
  const t = useT();
  // Tarayıcı yeteneği sunucuda bilinemez: sunucu anlık görüntüsü "hidden"
  // (kart çizilmez), istemcide gerçek durumla değişir
  const detected = useSyncExternalStore<NotifyState>(noopSubscribe, detectNotifyState, () => "hidden");
  const [override, setOverride] = useState<"on" | "idle" | "denied" | "ios" | null>(null);
  const [busy, setBusy] = useState(false);

  const state = override ?? detected;
  if (state === "hidden" || state === "on") return null;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#1a0e2a] p-3">
      <p className="text-xs font-semibold text-white">{t.suggest.notifyTitle}</p>
      <p className="mt-1 text-[11px] text-[#9ca3af]">
        {state === "ios" ? t.suggest.notifyIos : state === "denied" ? t.suggest.notifyDenied : t.suggest.notifyDesc}
      </p>
      {state === "idle" && (
        <button
          onClick={async () => {
            setBusy(true);
            const ok = await subscribeToPush();
            setBusy(false);
            if (ok) return setOverride("on");
            // Neden olmadı: izin reddedildi mi, yoksa cihazda API'ler yok mu?
            setOverride(needsHomeScreen() && !isPushSupported() ? "ios" : "denied");
          }}
          disabled={busy}
          className="mt-2.5 flex h-9 w-full items-center justify-center rounded-lg text-xs font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
        >
          {busy ? t.suggest.notifyBusy : t.suggest.notifyCta}
        </button>
      )}
    </div>
  );
}
