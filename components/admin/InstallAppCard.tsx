"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// Paneli cihaza uygulama olarak kurdurur. Kurulum mekana özel manifest'i
// kullandığı için (app/admin/[venueId]/manifest.webmanifest) ikon adminin kendi
// mekanının adı/logosuyla iner ve doğrudan kendi paneline açılır.
//
// Tarayıcı farkları:
// - Chrome/Edge (Android + masaüstü): beforeinstallprompt yakalanır, tek tık.
// - iOS Safari: kurulum API'si YOK, elle "Paylaş → Ana Ekrana Ekle" gerekir.
// - Firefox/masaüstü Safari: kurulum yok, yönerge gösterilir.

type Prompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Env = "checking" | "installed" | "ios" | "manual";

const STANDALONE_QUERY = "(display-mode: standalone)";

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS masaüstü Safari gibi görünür
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Kurulu olup olmadığı React'in dışında bir bilgi (görüntüleme kipi + kurulum
// olayı), bu yüzden state yerine abonelikle okunur: sunucu render'ı "checking"
// olur, hidrasyon uyuşmazlığı çıkmaz.
function subscribeEnv(cb: () => void) {
  const media = window.matchMedia(STANDALONE_QUERY);
  media.addEventListener("change", cb);
  window.addEventListener("appinstalled", cb);
  return () => {
    media.removeEventListener("change", cb);
    window.removeEventListener("appinstalled", cb);
  };
}

function readEnv(): Env {
  const standalone =
    window.matchMedia(STANDALONE_QUERY).matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  return isIOS() ? "ios" : "manual";
}

export default function InstallAppCard() {
  const env = useSyncExternalStore(subscribeEnv, readEnv, () => "checking" as Env);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // beforeinstallprompt sayfa yüklendikten kısa süre sonra gelir; o gelene
    // kadar elle kurulum yönergesi gösterilir, gelince düğmeye dönüşür.
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as Prompt);
    };
    const onInstalled = () => setPrompt(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      // Kullanılan istem tekrar açılamaz; kabul edildiyse "kurulu" durumuna
      // appinstalled olayı geçirir, reddedildiyse elle kurulum yönergesi kalır.
      setPrompt(null);
      setBusy(false);
    }
  }, [prompt]);

  if (env === "checking") return null;
  const state = env !== "installed" && prompt ? "ready" : env;

  return (
    <div
      className="mt-4 rounded-2xl border border-white/10 p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div>
        <p className="text-white text-sm font-semibold">Paneli Uygulama Olarak Kur</p>
        <p className="text-[#6b7280] text-xs mt-1">
          Telefonuna ve bilgisayarına mekanının adı ve logosuyla bir uygulama iner; dokununca
          doğrudan bu panel açılır. Adres yazmana gerek kalmaz.
        </p>
      </div>

      {state === "installed" && (
        <p className="flex items-center gap-2 text-xs text-[#22c55e]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Bu cihazda kurulu — panel uygulama penceresinde açılıyor.
        </p>
      )}

      {state === "ready" && (
        <button
          type="button"
          onClick={install}
          disabled={busy}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-70"
          style={{ background: "#e91e8c", color: "white" }}
        >
          {busy ? "Kuruluyor..." : "Bu cihaza kur"}
        </button>
      )}

      {state === "ios" && (
        <p className="text-[#9ca3af] text-xs leading-relaxed">
          iPhone/iPad&apos;de Safari ile bu sayfadayken alttaki{" "}
          <span className="text-white">Paylaş</span> düğmesine, sonra{" "}
          <span className="text-white">Ana Ekrana Ekle</span>&apos;ye dokun. Uygulamayı ilk açtığında
          bir kez daha giriş yapman istenir — iPhone kurulu uygulamanın oturumunu Safari&apos;den
          ayrı tutuyor.
        </p>
      )}

      {state === "manual" && (
        <p className="text-[#9ca3af] text-xs leading-relaxed">
          Chrome veya Edge kullanıyorsan adres çubuğunun sağındaki{" "}
          <span className="text-white">kur</span> simgesine (ya da menüden{" "}
          <span className="text-white">Uygulamayı yükle</span>) tıkla. Simge görünmüyorsa sayfayı
          yenile; Firefox ve masaüstü Safari kurulumu desteklemiyor.
        </p>
      )}
    </div>
  );
}
