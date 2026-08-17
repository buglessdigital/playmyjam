"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Bu cihaz müziği ÇALAN cihaz mı, yoksa uzaktan kumanda mı?
 *
 * Panel oynatıcısı panel kabuğunda asılı duruyor (bkz. MiniPlayer) ve panel
 * açık olan HER cihazda açılıyordu. Telefonda bu iki kere yanlış: (1) sağ altta
 * duran video kartı küçük ekranın altını kaplayıp paneli kullanılamaz hale
 * getiriyor, (2) kimse mekanın müziğini telefonundan çalmıyor — telefondan
 * panele girmenin amacı BİLGİSAYARDA açık olan oynatıcıyı yönetmek.
 *
 * Bu yüzden telefonda oynatıcı hiç kurulmaz: panel yalnızca kumandadır
 * (oynat/duraklat/geç/ses/kuyruk hepsi zaten sunucu üzerinden gider, bkz.
 * /api/player ve lib/player-bus). Sahiplik de böylece bilgisayarda kalır —
 * telefonda bir oynatıcı açılsaydı çalmayı kendine alır (409) ve mekan susardı.
 *
 * Karar CİHAZ bazlı, pencere genişliği bazlı DEĞİL: bilgisayarda pencereyi
 * daraltmak müziği kesmemeli. Eşik bilerek dar tutuldu (kısa kenar < 600 px):
 * tablet ölçüsündeki cihazlar (bir kısmı mekanlarda müziği çalıyor) eskisi gibi
 * oynatıcıyı kurar. Karar kullanıcı tarafından her iki yöne de çevrilebilir ve
 * o seçim cihazda saklanır — "Bu cihazda çal" diyen telefon da çalabilir.
 */

/** Kısa kenarı bundan küçük + dokunmatik cihaz = telefon sayılır. */
const PHONE_MAX_SHORT_EDGE = 600;

const STORAGE_KEY = "pmj:player-host";

/** null = henüz karar verilmedi (sunucu render'ı). */
type Host = boolean | null;

let host: Host = null;
const listeners = new Set<() => void>();

function readOverride(): boolean | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    // gizli mod / erişim yok — cihaz tahminiyle devam
  }
  return null;
}

function deviceIsPhone(): boolean {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  if (!coarse) return false;
  // Ekranın kendi ölçüsü (pencere değil): telefon yatay çevrilince de aynı karar.
  const shortEdge = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight);
  return shortEdge > 0 && shortEdge < PHONE_MAX_SHORT_EDGE;
}

/**
 * Cihazın KENDİSİ telefon mu (kullanıcının seçiminden bağımsız)? Panel, seçimi
 * geri almanın yolunu yalnızca burada gösterir: bilgisayarda "kumanda moduna
 * dön" diye bir düğme anlamsız olurdu.
 */
let phone: boolean | null = null;
const noopSubscribe = () => () => {};
const phoneSnapshot = () => {
  if (phone === null) phone = typeof window !== "undefined" && deviceIsPhone();
  return phone;
};

export function usePhoneDevice(): boolean {
  return useSyncExternalStore(noopSubscribe, phoneSnapshot, () => false);
}

function decide(): boolean {
  if (typeof window === "undefined") return false;
  return readOverride() ?? !deviceIsPhone();
}

function snapshot(): Host {
  if (host === null && typeof window !== "undefined") host = decide();
  return host;
}

const serverSnapshot = (): Host => null;

/**
 * true = oynatıcı bu cihazda kurulur, false = kumanda modu,
 * null = karar henüz verilmedi (hidrasyon turu; hiçbir şey kurulmaz).
 */
export function usePlayerHost(): Host {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    snapshot,
    serverSnapshot
  );
}

/** Kullanıcının seçimi: cihazda saklanır, sonraki açılışlarda da geçerli. */
export function setPlayerHost(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {}
  if (host === value) return;
  host = value;
  listeners.forEach((cb) => cb());
}
