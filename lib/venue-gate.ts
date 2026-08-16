"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { venueMemberCookieName } from "@/lib/venue-auth-cookie";

// Misafir erişimi: kuyruk/gözat/şarkı sayfaları giriş istemez. Hesap gerektiren
// eylemler (sıraya ekleme, istek, favori, jeton, profil) buradan geçer ve
// hesabı olmayanı mekanın giriş ekranına gönderir. Kural zorlaması sunucuda
// (proxy + API rotaları) — buradaki kontrol yalnızca 401 yiyip sessizce
// başarısız olmayı önleyen arayüz katmanı.

export function venueLoginPath(venueId: string, next?: string) {
  const base = `/venue/${venueId}/login`;
  if (!next) return base;
  return `${base}?next=${encodeURIComponent(next)}`;
}

// Login sonrası dönülecek yol: yalnızca aynı mekanın altındaki yollar kabul
// edilir (açık yönlendirme ve mekanlar arası sızıntı olmasın)
export function safeNextPath(next: string | null, venueId: string): string {
  const fallback = `/venue/${venueId}/browse`;
  if (!next || !next.startsWith(`/venue/${venueId}/`)) return fallback;
  if (next.startsWith(`/venue/${venueId}/login`)) return fallback;
  return next;
}

function readMemberCookie(venueId: string): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c === `${venueMemberCookieName(venueId)}=1`);
}

// Çerez değişimi olay yaymaz; değer zaten yalnızca tam gezinmeyle değişiyor
const noopSubscribe = () => () => {};

/**
 * `isMember`: bu mekanda hesabı açık mı (sunucu/hidrasyon anlık görüntüsü her
 * zaman false — sayfa kabuğu statik üretildiği için çerez ancak istemcide okunur).
 * `requireAccount(next?)`: hesap yoksa login'e yönlendirip false döner.
 */
export function useVenueGate(venueId: string) {
  const router = useRouter();
  const isMember = useSyncExternalStore(
    noopSubscribe,
    () => readMemberCookie(venueId),
    () => false
  );

  const requireAccount = useCallback(
    (next?: string) => {
      // Çerez her çağrıda tazeden okunur: başka sekmede giriş yapılmış olabilir
      if (readMemberCookie(venueId)) return true;
      const target = next ?? (typeof window !== "undefined" ? window.location.pathname : undefined);
      router.push(venueLoginPath(venueId, target));
      return false;
    },
    [router, venueId]
  );

  return { isMember, requireAccount };
}
