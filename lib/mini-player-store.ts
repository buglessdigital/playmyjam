"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Panel oynatıcısının görsel yuvası.
 *
 * Oynatıcı ayrı bir sekmede değil, kuyruk panosundaki "ŞU AN ÇALIYOR" kartının
 * içinde duruyor ve HEP AÇIK: aç/kapa düğmesi yok, mekanın tek yapması gereken
 * ilk açılışta bir kez "Başlat"a dokunmak (tarayıcı politikası).
 *
 * iframe'i DOM'da BAŞKA BİR EBEVEYNE TAŞIMAK videoyu baştan yükletir; bu yüzden
 * oynatıcı hep panel kabuğunda, tek bir yerde asılı durur (bkz. MiniPlayer).
 * Ekranda "kartın içindeymiş" gibi görünmesini şu sağlıyor: sayfa bir yuva (boş
 * kutu) çizer, oynatıcı da o kutunun ölçtüğü dikdörtgene sabitlenir. Kutu yeri
 * ayırdığı için hiçbir şeyin üstüne binmez; yuva olmayan sayfalarda (Ayarlar,
 * İstatistik) sağ alt köşeye düşer.
 */

/**
 * "ŞU AN ÇALIYOR" kartındaki yuvanın genişliği; 16:9 olduğu için yükseklik
 * buna bağlı (144 → 81 px). Kart bu kadar uzuyor, kalanı şarkı adına kalıyor.
 */
export const MINI_SLOT_WIDTH = 144;

/**
 * Yuvasız sayfalarda köşedeki kutunun genişliği. Daha da küçültme: YouTube
 * oynatıcının görünür ve makul boyutta kalmasını şart koşuyor, minik iframe'de
 * oynatma da güvenilmez oluyor.
 */
export const MINI_CORNER_WIDTH = 208;

let slotEl: HTMLElement | null = null;
const slotListeners = new Set<() => void>();

export function setMiniSlot(el: HTMLElement | null) {
  if (slotEl === el) return;
  slotEl = el;
  slotListeners.forEach((cb) => cb());
}

export function useMiniSlot(): HTMLElement | null {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      slotListeners.add(cb);
      return () => slotListeners.delete(cb);
    }, []),
    () => slotEl,
    () => null
  );
}
