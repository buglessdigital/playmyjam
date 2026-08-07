"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPlayerOnline } from "@/lib/player-status";

/** Heartbeat tazeliğinin yeniden değerlendirilme sıklığı. */
const RECHECK_MS = 10_000;

/**
 * Mekanın oynatıcısı canlı mı? Heartbeat now_playing satırına yazıldığı için
 * Realtime ile anında, arada da zamanlayıcıyla (heartbeat kesilince satır
 * değişmez, yalnızca zaman ilerler) tazelenir.
 *
 * `null` = henüz bilinmiyor. Çağıranlar ilk okuma gelene kadar yanlış uyarı
 * göstermemek için bunu "açık" gibi ele almalı.
 */
export function usePlayerOnline(venueDbId: string | null | undefined): boolean | null {
  const supabase = useMemo(() => createClient(), []);
  const [lastBeat, setLastBeat] = useState<string | null | undefined>(undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    const fetchBeat = async () => {
      const { data, error } = await supabase
        .from("now_playing")
        .select("last_heartbeat_at")
        .eq("venue_id", venueDbId)
        .maybeSingle();
      if (cancelled) return;
      // Geçici bir okuma hatası "player kapalı" demek değil: eldeki değeri koru,
      // yoksa tek bir ağ tökezlemesi ekleme kilidini yanlışlıkla kapatıyor
      if (error) return;
      setLastBeat((data as { last_heartbeat_at: string | null } | null)?.last_heartbeat_at ?? null);
      setNowMs(Date.now());
    };

    fetchBeat();

    const channel = supabase
      .channel(`player-status:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` },
        fetchBeat
      )
      .subscribe();

    // Heartbeat kesilince satır değişmez; tazelik yalnızca saat ilerledikçe bozulur.
    // Aynı turda satır da yeniden okunur: Realtime kanalı sessizce düşerse
    // (uyuyan sekme, ağ kesintisi) player açıkken "kapalı" görünmesin.
    const interval = setInterval(() => {
      setNowMs(Date.now());
      fetchBeat();
    }, RECHECK_MS);

    const onWake = () => {
      if (document.visibilityState === "visible") fetchBeat();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      supabase.removeChannel(channel);
    };
  }, [venueDbId, supabase]);

  if (lastBeat === undefined) return null;
  return isPlayerOnline(lastBeat, nowMs);
}
