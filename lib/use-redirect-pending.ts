"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Dış siteye (iyzico, Google OAuth) yönlendiren düğmelerin "gidiliyor..."
 * durumu. Yönlendirme sayfayı terk ettiği için bu bayrak normalde kendi
 * kendine sıfırlanmaz: kullanıcı ödemeyi/girişi yapmadan geri gelirse sayfa
 * bfcache'ten aynı state ile geri yüklenir ve düğme sonsuza dek kilitli kalır.
 *
 * Bu yüzden sayfa yeniden görünür olduğunda bayrağı düşürüyoruz — bfcache'li
 * geri dönüşte `pageshow`, sekme değişiminden dönüşte `visibilitychange`.
 */
export function useRedirectPending(): [boolean, (v: boolean) => void] {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const clear = () => setPending(false);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) clear();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") clear();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending]);

  return [pending, useCallback((v: boolean) => setPending(v), [])];
}
