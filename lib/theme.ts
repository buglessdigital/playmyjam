"use client";

import { useSyncExternalStore } from "react";
import { nativeSetSystemBars } from "@/lib/native-app";
import { DARK_QUERY, THEME_KEY } from "@/lib/theme-boot";

// Müşteri panelinin açık/koyu teması. Seçim cihazda (localStorage) durur;
// "system" telefonun ayarını izler. Tema yalnız müşteri panelinde geçerli:
// html[data-theme] özniteliğini ThemeSync (venue layout) koyar ve panelden
// çıkınca kaldırır — mekan paneli, vitrin ve super admin hep koyu.
// Renkler: app/globals.css (--pmj-*). İlk boyamadan önce uygulanması için
// kök layout'ta THEME_BOOT_SCRIPT var (lib/theme-boot.ts) (yoksa açık temada koyu yanıp söner).

export type ThemePref = "dark" | "light" | "system";
export type Theme = "dark" | "light";

const CHANGE_EVENT = "pmj-theme-change";

/** Status bar / tarayıcı çubuğu rengi = sayfa zemini (globals.css --pmj-bg) */
const BAR_COLOR: Record<Theme, string> = { dark: "#0f0a18", light: "#f6f1fb" };

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "system") return v;
  } catch {
    // depolama kapalı: koyu
  }
  return "dark";
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref === "system") {
    return typeof window !== "undefined" && !window.matchMedia(DARK_QUERY).matches ? "light" : "dark";
  }
  return pref;
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}

/** Kullanıcının seçimi (ayarlar ekranı için); sunucuda "dark" */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "dark");
}

/** Şu an geçerli tema ("system" çözülmüş hali) */
export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, () => resolveTheme(readPref()), () => "dark");
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // depolama kapalı: yalnız bu sayfa ömrü boyunca
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Temayı belgeye uygular: öznitelik + tarayıcı çubuğu + uygulamanın status bar'ı */
export function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  const color = BAR_COLOR[theme ?? "dark"];
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  nativeSetSystemBars({ background: color, dark: theme !== "light" });
}

// GEÇİCİ: açık tema onaylanana kadar seçici yalnız bu işaretin olduğu cihazda
// görünür (geliştiricinin telefonu). Onaydan sonra bu kanca ve kullanımları silinir.
const BETA_KEY = "pmj-theme-beta";
function readBeta(): boolean {
  try {
    return localStorage.getItem(BETA_KEY) === "1";
  } catch {
    return false;
  }
}
export function useThemeBeta(): boolean {
  return useSyncExternalStore(subscribe, readBeta, () => false);
}
