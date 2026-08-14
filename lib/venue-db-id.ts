"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Slug ("mezzanine") → mekanın veritabanı kimliği.
 *
 * Panelin her parçası bu kimliği ayrı ayrı soruyordu: ana ekran bir kez, kenar
 * çubuğu bir kez, istekler sayfası bir kez daha. Üstelik SORGU BİTENE KADAR
 * hiçbir veri yüklenmiyor — panelin ilk baytı bu tek satırlık sorgunun arkasında
 * bekliyordu ve sayfalar arası her gezinmede aynı tur yeniden atılıyordu.
 *
 * Burada tek bir çözücü var: sonuç modül belleğinde ve sekme belleğinde tutulur,
 * aynı anda gelen istekler uçuştaki tek söze bağlanır. Yani slug başına sekme
 * ömrü boyunca en fazla bir sorgu; sonraki gezinmeler ağ turu olmadan başlar.
 */

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();

const storageKey = (slug: string) => `pmj-venue-id:${slug}`;

function readCache(slug: string): string | null {
  const hit = cache.get(slug);
  if (hit) return hit;
  try {
    const stored = sessionStorage.getItem(storageKey(slug));
    if (stored) {
      cache.set(slug, stored);
      return stored;
    }
  } catch {}
  return null;
}

function writeCache(slug: string, id: string) {
  cache.set(slug, id);
  try {
    sessionStorage.setItem(storageKey(slug), id);
  } catch {}
  for (const cb of listeners) cb();
}

export function resolveVenueDbId(slug: string): Promise<string | null> {
  const hit = readCache(slug);
  if (hit) return Promise.resolve(hit);

  const pending = inFlight.get(slug);
  if (pending) return pending;

  const run = (async () => {
    const supabase = createClient();
    const { data } = await supabase.from("venues").select("id").eq("slug", slug).single();
    if (data?.id) {
      writeCache(slug, data.id);
      return data.id as string;
    }
    return null;
  })().finally(() => {
    inFlight.delete(slug);
  });

  inFlight.set(slug, run);
  return run;
}

/**
 * Kimlik gelene kadar "" döner — çağıran taraf boş kimlikle iş başlatmamalı.
 *
 * Önbellek React'in dışında yaşadığı için abonelikle okunur: sunucu render'ı
 * hep "" verir (hidrasyon uyuşur), önbellekte kayıt varsa istemci ilk render'da
 * kimliği ağ turu OLMADAN görür.
 */
export function useVenueDbId(slug: string): string {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const getSnapshot = useCallback(() => (slug ? readCache(slug) ?? "" : ""), [slug]);
  const venueDbId = useSyncExternalStore(subscribe, getSnapshot, () => "");

  useEffect(() => {
    if (!slug || venueDbId) return;
    void resolveVenueDbId(slug);
  }, [slug, venueDbId]);

  return venueDbId;
}
