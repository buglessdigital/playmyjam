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
  return useRedirectPendingValue<boolean>(false);
}

/**
 * Aynı davranışın "hangi düğmeye basıldı" gibi boolean olmayan durumlar için
 * hâli: `idle` dışındaki her değer "gidiliyor" sayılır ve dönüşte `idle`'a döner.
 */
export function useRedirectPendingValue<T>(idle: T): [T, (v: T) => void] {
  const [pending, setPending] = useState<T>(idle);

  useEffect(() => {
    if (pending === idle) return;
    const clear = () => setPending(idle);
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
  }, [pending, idle]);

  return [pending, useCallback((v: T) => setPending(v), [])];
}
