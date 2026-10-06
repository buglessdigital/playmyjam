"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isCustomerAddsPaused } from "@/lib/customer-adds";
import { useVenueLive } from "@/lib/venue-live";

/** Kapatmanın 12 saatlik süresinin dolup dolmadığını yeniden değerlendirme sıklığı. */
const RECHECK_MS = 60_000;

/**
 * Mekan müşteri eklemelerini kapattı mı? (0072, bkz. lib/customer-adds.ts)
 *
 * Değer açılışta now_playing'den bir kez okunur; sonra mekan canlı hattının
 * `np` mesajıyla gelir (panelde anahtar değişince tetikleyici yollar).
 *
 * Bilinmiyorken ve okuma hatasında `false` döner: kapı sunucuda da var
 * (/api/queue), yanlış "kapalı" uyarısı satış kaçırtır.
 */
export function useCustomerAddsPaused(venueDbId: string | null | undefined): boolean {
  const supabase = useMemo(() => createClient(), []);
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    const fetchPause = async () => {
      const { data, error } = await supabase
        .from("now_playing")
        .select("customer_adds_paused_at")
        .eq("venue_id", venueDbId)
        .maybeSingle();
      // 0072 öncesi kolon yok → hata; geçici ağ hatasında da eldeki değer korunur
      if (cancelled || error) return;
      setPausedAt((data as { customer_adds_paused_at: string | null } | null)?.customer_adds_paused_at ?? null);
      setNowMs(Date.now());
    };
    fetchRef.current = fetchPause;
    fetchPause();

    const interval = setInterval(() => setNowMs(Date.now()), RECHECK_MS);
    return () => {
      cancelled = true;
      fetchRef.current = () => {};
      clearInterval(interval);
    };
  }, [venueDbId, supabase]);

  useVenueLive(venueDbId, (event, payload) => {
    if (event === "np") {
      // Anahtar yoksa mesaj 0072 öncesi tetikleyiciden geliyor — değere dokunma
      if (!("customer_adds_paused_at" in payload)) return;
      const at = payload.customer_adds_paused_at;
      if (typeof at === "string" || at === null) {
        setPausedAt(at);
        setNowMs(Date.now());
      }
    } else if (event === "resync" || event === "ready") {
      fetchRef.current();
    }
  });

  return isCustomerAddsPaused(pausedAt, nowMs);
}
