"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Jeton bakiyesinin panel geneline açık kopyası.
 *
 * Bakiyeyi zaten her sayfa kendi durum RPC'sinde okuyor; buradaki depo o değeri
 * alt gezinmedeki "JETON AL" rozetiyle paylaşır — rozet için ayrı sorgu
 * atılmasın, harcama/satın alma sonrası da anında güncellensin diye.
 * Sayfalar okudukları değeri `publishTokenBalance` ile buraya bırakır.
 *
 * sessionStorage kopyası yalnızca tam yenilemede rozetin boş yanıp sönmemesi
 * için: değer gerçeğin kendisi değil, ilk boyamalık tahmin.
 */

const CACHE_KEY = "pmj-token-balance";

let balance: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function publishTokenBalance(next: number | null) {
  if (balance === next) return;
  balance = next;
  try {
    if (next === null) sessionStorage.removeItem(CACHE_KEY);
    else sessionStorage.setItem(CACHE_KEY, String(next));
  } catch {
    // gizli kip: önbellek yok, her açılışta yeniden okunur
  }
  emit();
}

/** Tam yenileme sonrası ilk boyama için son bilinen değer. */
export function hydrateTokenBalanceFromCache() {
  if (balance !== null) return;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw === null) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      balance = parsed;
      emit();
    }
  } catch {
    // yok say
  }
}

export function useTokenBalance(): number | null {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => balance,
    () => null
  );
}
