"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import trDict from "./dictionaries/tr.json";
import enDict from "./dictionaries/en.json";

export type Lang = "tr" | "en";

// tr.json sözlüğün şeması; en.json bu tipe atandığı için eksik anahtar derlemede patlar.
export type Dictionary = typeof trDict;

// Açık tip ataması bilinçli: en.json'da eksik anahtar varsa burada derleme hatası verir.
const en: Dictionary = enDict;

const DICTS: Record<Lang, Dictionary> = { tr: trDict, en };

export const LANG_STORAGE_KEY = "pmj-lang";
export const LANG_COOKIE = "pmj_lang";

function normalize(value: string | null | undefined): Lang | null {
  return value === "tr" || value === "en" ? value : null;
}

// Basit modül-içi depo: React ağacının dışında da (ör. fetch başlıkları) okunabilsin.
// Sunucu anlık görüntüsü her zaman "tr" — kök layout dinamikleşmesin diye cookie
// sunucuda okunmuyor (bkz. statik mekan kabukları).
let current: Lang = "tr";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Lang {
  return current;
}

function getServerSnapshot(): Lang {
  return "tr";
}

/** React dışından mevcut dili okur (ör. API'ye Accept-Language göndermek için). */
export function currentLang(): Lang {
  return current;
}

/**
 * React dışındaki saf yardımcılar için sözlük (ör. `formatWait`). Tepki vermez —
 * çağıran bileşen `useT()` ile zaten yeniden render olduğu için değer tazedir.
 */
export function currentDict(): Dictionary {
  return DICTS[current];
}

function readStored(): Lang {
  if (typeof document === "undefined") return "tr";
  const stored = normalize(window.localStorage.getItem(LANG_STORAGE_KEY));
  if (stored) return stored;
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LANG_COOKIE}=`))
    ?.split("=")[1];
  return normalize(cookie) ?? "tr";
}

function persist(lang: Lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // private mode — cookie yeterli
  }
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = lang;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  persist(lang);
  emit();
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // İlk boyama sunucuyla aynı (tr); kayıtlı tercih hidrasyondan hemen sonra uygulanır.
  useEffect(() => {
    const stored = readStored();
    if (stored !== current) {
      current = stored;
      emit();
    }
    document.documentElement.lang = current;
  }, []);

  return <>{children}</>;
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Aktif dilin sözlüğü: `const t = useT(); t.nav.pricing` */
export function useT(): Dictionary {
  return DICTS[useLang()];
}

export function useI18n() {
  const lang = useLang();
  const change = useCallback((next: Lang) => setLang(next), []);
  return useMemo(() => ({ lang, t: DICTS[lang], setLang: change }), [lang, change]);
}

/**
 * Sözlükteki `{isim}` yer tutucularını doldurur:
 * `fmt(t.queue.position, { n: 3 })` → "Sırada 3. şarkısın"
 */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}
