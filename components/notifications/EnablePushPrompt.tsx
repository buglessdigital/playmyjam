"use client";

import { useEffect, useState } from "react";
import { getPermission, isPushSupported, subscribeToPush, CUSTOMER_PUSH_ENDPOINT } from "@/lib/notifications";
import { useT } from "@/lib/i18n";

// Uygulama (PWA) olarak açıldığında çıkan bildirim izni kartı.
//
// Neden burada: talep onayının ömrü 10 dakika. Müşteri uygulamayı kurup bildirimi
// açmazsa onayı göremeden süre doluyor. Kurulumdan hemen sonra, kullanıcı daha
// akıştayken sormak izin verme oranını yükseltiyor.
//
// Yalnızca UYGULAMA KİPİNDE (standalone) çıkar — tarayıcı sekmesinde talep
// gönderdikten sonraki kart (components/browse/NotifyOptIn) zaten var, ikisi
// üst üste binmesin. İzni tarayıcıya kendimiz sormayız; düğmeye basılınca
// sorulur (Safari izin isteğini kullanıcı hareketine bağlıyor).

const SNOOZE_KEY = "pmj-push-prompt-snoozed";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // "Şimdi değil" dendiyse 3 gün sorma
const APPEAR_DELAY_MS = 1200; // açılışın ilk karmaşasında değil, oturduktan sonra

type State = "hidden" | "ask" | "denied" | "failed" | "done";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function snoozed(): boolean {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    return raw !== null && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
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

export default function EnablePushPrompt() {
  const t = useT();
  const [state, setState] = useState<State>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      if (!isStandalone() || !isPushSupported() || snoozed()) return;

      const permission = getPermission();
      // İzin engellenmişse kart yalnızca nedenini anlatır; düğme işe yaramaz.
      if (permission === "denied") {
        timer = setTimeout(() => !cancelled && setState("denied"), APPEAR_DELAY_MS);
        return;
      }
      // İzin verilmiş olsa bile abonelik sunucuda olmayabilir (istek yarıda
      // kalmış, abonelik yenilenmiş): asıl ölçüt kayıt.
      if (permission === "granted" && (await registeredOnServer())) return;
      if (cancelled) return;

      timer = setTimeout(() => !cancelled && setState("ask"), APPEAR_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const allow = async () => {
    setBusy(true);
    const ok = await subscribeToPush();
    setBusy(false);
    if (ok) return setState("done");
    setState(getPermission() === "denied" ? "denied" : "failed");
  };

  const later = () => {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      // gizli mod: bu oturumda kapatmak yeterli
    }
    setState("hidden");
  };

  if (state === "hidden" || state === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={later}
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-prompt-title"
    >
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 sm:rounded-3xl"
        style={{ background: "#1a0e2a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(233,30,140,0.12)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
              stroke="#e91e8c"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 id="push-prompt-title" className="text-center text-lg font-bold text-white">
          {t.pushPrompt.title}
        </h2>

        {state === "denied" ? (
          <p className="mt-3 text-center text-sm text-[#9ca3af]">{t.pushPrompt.denied}</p>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-[#9ca3af]">{t.pushPrompt.desc}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[t.pushPrompt.why1, t.pushPrompt.why2, t.pushPrompt.why3].map((why) => (
                <li key={why} className="flex gap-2 text-xs leading-relaxed text-[#d1d5db]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#e91e8c" }} />
                  {why}
                </li>
              ))}
            </ul>
            {state === "failed" && (
              <p className="mt-3 text-center text-xs text-[#fca5a5]">{t.pushPrompt.failed}</p>
            )}
            <button
              onClick={allow}
              disabled={busy}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
            >
              {busy ? t.pushPrompt.busy : t.pushPrompt.cta}
            </button>
          </>
        )}

        <button
          onClick={later}
          className="mt-3 w-full text-center text-xs font-medium text-[#9ca3af]"
        >
          {state === "denied" ? t.common.close : t.pushPrompt.later}
        </button>
      </div>
    </div>
  );
}
