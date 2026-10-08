"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { deepLinkToPath, nativePlatform, nativePlugins } from "@/lib/native-app";
import { publishTokenBalance } from "@/lib/token-balance-store";
import { fmt, useT } from "@/lib/i18n";

// Mağaza uygulamasının (Capacitor kabuğu) WebView'i ile web kodu arasındaki
// yapıştırıcı. Normal tarayıcıda hiçbir şey yapmaz, hiçbir şey çizmez.
//   1) Derin bağlantılar: playmyjam://… ve Universal/App Link'ler WebView'de açılır
//      (Google girişi dönüşü dahil — bkz. app/auth/native-callback).
//   2) Uygulama hediyesi: kayıtlı hesapla ilk girişte cihaz kanıtıyla 1 jeton
//      istenir (bkz. app/api/app/gift, 0076).

const GIFT_DONE_KEY = "pmj-app-gift-done";

export default function NativeAppBridge() {
  const t = useT();
  const [giftTokens, setGiftTokens] = useState<number | null>(null);

  useEffect(() => {
    const app = nativePlugins()?.App;
    if (!app) return;
    let listener: { remove: () => unknown } | null = null;
    let cancelled = false;
    Promise.resolve(
      app.addListener("appUrlOpen", ({ url }) => {
        const path = deepLinkToPath(url);
        if (!path) return;
        // Google dönüşünde sistem tarayıcısı sayfası açık kalmasın
        if (path.startsWith("/auth/")) void nativePlugins()?.Browser?.close().catch(() => {});
        window.location.assign(path);
      })
    ).then((l) => {
      if (cancelled) void l.remove();
      else listener = l;
    });
    return () => {
      cancelled = true;
      void listener?.remove();
    };
  }, []);

  useEffect(() => {
    const platform = nativePlatform();
    const device = nativePlugins()?.PmjDevice;
    if (!platform || !device) return;

    let running = false;
    const tryClaim = async (isAnonymous: boolean) => {
      if (running || isAnonymous || readDone()) return;
      running = true;
      try {
        const res = await fetch("/api/app/gift");
        if (!res.ok) return;
        const first = (await res.json()) as { nonce?: string; status?: string };
        if (!first.nonce) {
          if (first.status === "already_claimed") markDone();
          return;
        }
        const { proof } = await device.getProof({ nonce: first.nonce });
        const claim = await fetch("/api/app/gift", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, nonce: first.nonce, proof }),
        });
        if (!claim.ok) return;
        const result = (await claim.json()) as { status: string; tokens?: number; balance?: number };
        // unverified: doğrulayıcı henüz yok/geçici hata — sonraki açılışta yeniden denenir
        if (result.status === "unverified") return;
        markDone();
        if (result.status === "granted") {
          if (typeof result.balance === "number") publishTokenBalance(result.balance);
          setGiftTokens(result.tokens ?? 1);
        }
      } catch {
        // Ağ/eklenti hatası: hediye bir sonraki açılışta yeniden denenir
      } finally {
        running = false;
      }
    };

    const supabase = createClient();
    void (async () => {
      const { data } = await supabase.auth.getClaims();
      const claims = data?.claims as { sub?: string; is_anonymous?: boolean } | undefined;
      if (claims?.sub) void tryClaim(claims.is_anonymous === true);
    })();
    // Misafir Google/e-posta bağlayınca aynı oturumda kayıtlı hesaba döner
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) void tryClaim(session.user.is_anonymous === true);
      }
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (giftTokens === null) return;
    const timer = setTimeout(() => setGiftTokens(null), 6000);
    return () => clearTimeout(timer);
  }, [giftTokens]);

  if (giftTokens === null) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[60] mx-auto max-w-md rounded-2xl border border-[#e91e8c]/40 bg-[#170e25]/95 px-4 py-3 text-center shadow-xl backdrop-blur"
    >
      <p className="text-sm font-bold text-white">{t.nativeApp.giftTitle}</p>
      <p className="mt-0.5 text-xs text-[#c4b5d4]">{fmt(t.nativeApp.giftBody, { n: giftTokens })}</p>
    </div>
  );
}

function readDone(): boolean {
  try {
    return localStorage.getItem(GIFT_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(GIFT_DONE_KEY, "1");
  } catch {
    // depolama kapalı: sunucu zaten tekrarı reddediyor
  }
}
