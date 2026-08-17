"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CUSTOMER_PUSH_ENDPOINT,
  getPermission,
  isPushSupported,
  subscribeToPush,
} from "@/lib/notifications";
import {
  installPromptReady,
  runInstallPrompt,
  subscribeInstallPrompt,
} from "@/lib/install-prompt";
import { useT } from "@/lib/i18n";

// Talep gönderildikten sonraki isteğe bağlı adım: onay bildirimi için izin.
// Talep izinden BAĞIMSIZ olarak zaten iletildi — burada sadece "onaylanırsa
// haberin olsun" teklifi var, çünkü onay sonrası çalma penceresi 10 dakika.
//
// İKİ AŞAMA: önce mekan uygulamasının cihaza kurulması önerilir, sonra bildirim
// izni. Sıra böyle çünkü iPhone'da Safari sekmesinde web push API'leri hiç yok —
// bildirim ancak ana ekrana eklenmiş uygulamada çalışıyor. Android/masaüstünde
// kurulum zorunlu değil, o yüzden orada "şimdilik geç" bağlantısı var.
//
// Bildirim kararı TARAYICI İZNİNE değil, GERÇEK ABONELİĞE bakar: izin verilmiş
// olması bildirimin geleceği anlamına gelmiyor — abonelik sunucuya ulaşmamış
// olabilir (istek yarıda kalmış, abonelik yenilenmiş, kayıt silinmiş). O durumda
// düğme yine görünür ve tek dokunuşla kayıt tamamlanır.

type PushState = "checking" | "idle" | "on" | "hidden" | "ios" | "denied" | "failed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS masaüstü Safari gibi görünür
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function needsHomeScreen(): boolean {
  return isIOS() && !isStandalone();
}

// Tarayıcıdaki abonelik sunucuda da kayıtlı mı? (silent: doğrulama bildirimi atma)
async function registeredOnServer(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    const res = await fetch(CUSTOMER_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), silent: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function NotifyOptIn({
  compact = false,
  skipInstall = false,
}: { compact?: boolean; skipInstall?: boolean } = {}) {
  const t = useT();
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  // Kurulum aşaması: cihazda kurulu değilse önce bu gösterilir
  const [homeScreen, setHomeScreen] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [skippedInstall, setSkippedInstall] = useState(false);
  // Kurulum istemi sayfa açılışında yakalanıp saklanır (lib/install-prompt):
  // bu kart talep gönderildikten SONRA doğduğu için olayı kendisi dinleyemez.
  const prompt = useSyncExternalStore(subscribeInstallPrompt, installPromptReady, () => false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!cancelled) {
        setInstalled(isStandalone());
        setHomeScreen(needsHomeScreen());
      }

      if (!isPushSupported()) {
        // API'ler yok: iOS'ta ana ekrana eklenince gelirler, kart dursun
        if (!cancelled) setState(needsHomeScreen() ? "idle" : "hidden");
        return;
      }
      const permission = getPermission();
      if (permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      if (permission !== "granted") {
        if (!cancelled) setState("idle");
        return;
      }
      // İzin var — abonelik gerçekten sunucuda mı?
      const ok = await registeredOnServer();
      if (!cancelled) setState(ok ? "on" : "idle");
    })();

    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      cancelled = true;
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    setBusy(true);
    const outcome = await runInstallPrompt();
    setBusy(false);
    // Kurulum kabul edildiyse appinstalled olayı aşamayı ilerletir; reddedildiyse
    // ısrar etmeden bildirim adımına geçilir.
    if (outcome !== "accepted") setSkippedInstall(true);
  };

  const enable = async () => {
    setBusy(true);
    const ok = await subscribeToPush();
    setBusy(false);
    if (ok) return setState("on");
    if (getPermission() === "denied") return setState("denied");
    setState(needsHomeScreen() && !isPushSupported() ? "ios" : "failed");
  };

  // Doğrulama bildirimini yeniden yollar: "açık" yazıyor ama bildirim gelmiyorsa
  // kullanıcı bunu kendi sınayabilsin
  const test = async () => {
    setBusy(true);
    await subscribeToPush();
    setBusy(false);
  };

  if (state === "checking" || state === "hidden") return null;

  // 1. AŞAMA — kurulum. iPhone'da bildirimden önce zorunlu adım; diğer
  // cihazlarda öneri (tarayıcıda da bildirim çalışır, geçilebilir).
  //
  // skipInstall: dar yerlerde (talep gönderildi kartı) bu aşama hiç
  // gösterilmez — orada tek bir iş var, kurulum teklifi kartı uzatıyor.
  // iPhone'da bildirim yine de kurulum ister; o durumda kullanıcı "Bildirimleri
  // Aç"a bastığında 2. aşamadaki iOS yönergesi devreye girer.
  if (!skipInstall && !installed && state !== "on" && (homeScreen || (prompt && !skippedInstall))) {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-[#1a0e2a] p-3">
        <p className="text-xs font-semibold text-white">{t.suggest.installTitle}</p>
        {/* iPhone yönergesi adım adım anlatım — kısaltılamaz; öneri metni compact'te düşer */}
        {(homeScreen || !compact) && (
          <p className="mt-1 text-[11px] text-[#9ca3af]">
            {homeScreen ? t.suggest.installIos : t.suggest.installDesc}
          </p>
        )}
        {prompt && (
          <button
            onClick={install}
            disabled={busy}
            className="mt-2.5 flex h-9 w-full items-center justify-center rounded-lg text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            {busy ? t.suggest.notifyBusy : t.suggest.installCta}
          </button>
        )}
        {!homeScreen && (
          <button
            onClick={() => setSkippedInstall(true)}
            className="mt-2 w-full text-center text-[11px] font-medium text-[#9ca3af] underline"
          >
            {t.suggest.installSkip}
          </button>
        )}
      </div>
    );
  }

  // 2. AŞAMA — bildirim izni
  if (state === "on") {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#1a0e2a] px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {t.suggest.notifyOn}
        </p>
        <button
          onClick={test}
          disabled={busy}
          className="shrink-0 text-[11px] font-semibold text-[#e91e8c] disabled:opacity-50"
        >
          {busy ? t.suggest.notifyBusy : t.suggest.notifyTest}
        </button>
      </div>
    );
  }

  // compact: yalnızca "neden" satırı gizlenir — hata/yönerge metinleri (iOS
  // adımları, reddedilmiş izin, başarısız kayıt) her zaman kalır, onlar
  // olmadan kullanıcı takılıp kalır.
  const notifyLine =
    state === "ios"
      ? t.suggest.notifyIos
      : state === "denied"
        ? t.suggest.notifyDenied
        : state === "failed"
          ? t.suggest.notifyFailed
          : compact
            ? null
            : t.suggest.notifyDesc;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#1a0e2a] p-3">
      <p className="text-xs font-semibold text-white">{t.suggest.notifyTitle}</p>
      {notifyLine && <p className="mt-1 text-[11px] text-[#9ca3af]">{notifyLine}</p>}
      {state !== "denied" && state !== "ios" && (
        <button
          onClick={enable}
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
