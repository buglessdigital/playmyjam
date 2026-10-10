"use client";

import { useSyncExternalStore } from "react";

// iOS/Android uygulaması bir Capacitor kabuğu: playmyjam.com.tr'yi kendi
// WebView'inde açar, yani müşteri tarafı web'le AYNI koddur ve aynı anda
// güncellenir. Kabuk, sayfaya `window.Capacitor` köprüsünü enjekte eder.
//
// Web projesine @capacitor/* paketi EKLENMEDİ: eklentilere bu köprü üzerinden
// adla erişiliyor (paketler yalnızca kabuk projesinde). Bu dosya köprü yokken
// (normal tarayıcı) her yerde güvenle "web" der.
//
// Kabuğun sağlaması gereken sözleşme (Aşama 2/3):
//   * eklentiler: App (appUrlOpen), Browser (open/close), PmjDevice (getProof)
//   * URL şeması: playmyjam://  (Google dönüşü: playmyjam://auth/callback?...)
//   * Universal/App Links: https://playmyjam.com.tr/venue/... uygulamayı açar

export type NativePlatform = "ios" | "android";

type Listener = { remove: () => Promise<void> | void };

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: {
    App?: {
      addListener: (
        event: "appUrlOpen",
        cb: (data: { url: string }) => void
      ) => Promise<Listener> | Listener;
    };
    Browser?: {
      open: (opts: { url: string; presentationStyle?: "popover" | "fullscreen" }) => Promise<void>;
      close: () => Promise<void>;
    };
    /** @capacitor/barcode-scanner — sarmalayıcısız çağrıldığı için tüm alanlar verilir */
    CapacitorBarcodeScanner?: {
      scanBarcode: (opts: {
        hint: number;
        scanInstructions: string;
        scanButton: boolean;
        scanText: string;
        cameraDirection: number;
        scanOrientation: number;
        cancelButtonAccessibilityLabel?: string;
      }) => Promise<{ ScanResult: string }>;
    };
    Haptics?: {
      impact: (opts: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
      notification: (opts: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
    };
    /** Kendi eklentimiz: cihaz doğrulama kanıtı (App Attest/DeviceCheck · Play Integrity) */
    PmjDevice?: {
      getProof: (opts: { nonce: string }) => Promise<{ proof: string }>;
    };
  };
}

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

/** Mağaza uygulamasının içinde miyiz? (PWA kurulumu DEĞİL — o hâlâ web) */
export function isNativeApp(): boolean {
  return bridge()?.isNativePlatform?.() === true;
}

export function nativePlatform(): NativePlatform | null {
  if (!isNativeApp()) return null;
  const p = bridge()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : null;
}

export function nativePlugins() {
  return isNativeApp() ? bridge()?.Plugins ?? null : null;
}

export const NATIVE_SCHEME = "playmyjam:";

/**
 * Derin bağlantıyı WebView içindeki yola çevirir; tanımadığı adres için null.
 *   playmyjam://auth/callback?code=…   → /auth/callback?code=…
 *   playmyjam://venue/x/browse         → /venue/x/browse
 *   https://playmyjam.com.tr/venue/x   → /venue/x   (Universal/App Link)
 */
export function deepLinkToPath(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  let path: string;
  if (url.protocol === NATIVE_SCHEME) {
    // playmyjam://auth/callback → host "auth", pathname "/callback"
    path = `/${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } else if (url.protocol === "https:" && url.host === window.location.host) {
    path = url.pathname;
  } else {
    return null;
  }
  // Açık yönlendirme olmasın: yalnızca site içi, tek eğik çizgili yol
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return `${path}${url.search}`;
}

const noopSubscribe = () => () => {};

/**
 * Render içinde güvenli platform okuması: sunucuda ve ilk hidrasyonda null,
 * sonra gerçek değer — hidrasyon uyuşmazlığı olmaz. Köprü sayfa ömrü boyunca
 * değişmediği için abonelik gerekmez.
 */
export function useNativePlatform(): NativePlatform | null {
  return useSyncExternalStore(noopSubscribe, nativePlatform, () => null);
}

/**
 * Kamerayla karekod okutur, okunan metni döner; vazgeçilirse ya da eklenti
 * yoksa null. Değerler eklentinin enum'larından: QR_CODE=0, BACK=1, PORTRAIT=1.
 */
export async function scanQrCode(labels: { instructions: string; cancel: string }): Promise<string | null> {
  const scanner = nativePlugins()?.CapacitorBarcodeScanner;
  if (!scanner) return null;
  try {
    const { ScanResult } = await scanner.scanBarcode({
      hint: 0,
      scanInstructions: labels.instructions,
      scanButton: false,
      scanText: " ",
      cameraDirection: 1,
      scanOrientation: 1,
      cancelButtonAccessibilityLabel: labels.cancel,
    });
    return ScanResult?.trim() || null;
  } catch {
    // Kullanıcı vazgeçti ya da kamera izni verilmedi
    return null;
  }
}

/**
 * Okunan karekodu uygulama içi yola çevirir. Yalnızca PlayMyJam adresleri:
 * plaket ön yüzü (/venue/<slug>) ve arka yüzü (/<slug>/bilgi). Başka her şey null.
 */
export function qrToVenuePath(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== "playmyjam.com.tr") return null;
  const front = url.pathname.match(/^\/venue\/([^/]+)/);
  if (front) return `/venue/${front[1]}`;
  const back = url.pathname.match(/^\/([^/]+)\/bilgi\/?$/);
  if (back) return `/${back[1]}/bilgi`;
  return null;
}

/** Hafif dokunsal geri bildirim; tarayıcıda ve eklenti yoksa sessizce hiçbir şey yapmaz. */
export function nativeHaptic(kind: "tap" | "success" | "error"): void {
  const haptics = nativePlugins()?.Haptics;
  if (!haptics) return;
  const done =
    kind === "tap"
      ? haptics.impact({ style: "LIGHT" })
      : haptics.notification({ type: kind === "success" ? "SUCCESS" : "ERROR" });
  void done.catch(() => {});
}
