"use client";

import { useEffect } from "react";
// Modülün kendisi yüklenirken kurulum olayını dinlemeye başlar (bkz. dosya başı
// açıklaması) — kök layout bu bileşeni her sayfada render ettiği için olay
// sayfanın ilk anından itibaren yakalanır.
import { startInstallPromptCapture } from "@/lib/install-prompt";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    startInstallPromptCapture();

    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => {
        console.error("Service worker kaydı başarısız:", error);
      });
  }, []);

  return null;
}
