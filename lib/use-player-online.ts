"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPlayerOnline } from "@/lib/player-status";
import { useVenueLive } from "@/lib/venue-live";

/** Heartbeat tazeliğinin yeniden değerlendirilme sıklığı. */
const RECHECK_MS = 10_000;
/** Bayat görünen heartbeat'i kaynaktan doğrulama aralığının alt sınırı. */
const STALE_CONFIRM_MS = 30_000;

/**
 * Mekanın oynatıcısı canlı mı? Canlılık mekan canlı hattının `beat`/`np`
 * mesajlarıyla gelir (20 sn'de bir, veritabanı okuması yok — bkz. lib/venue-live.ts).
 * Heartbeat kesilince mesaj da kesilir; tazelik zamanlayıcıyla, yalnızca saat
 * ilerledikçe bozulur.
 *
 * Kanal sessizce düşerse (uyuyan sekme, ağ kesintisi) player açıkken "kapalı"
 * görünmesin diye: değer bayatlamış GÖRÜNDÜĞÜNDE satır kaynaktan bir kez
 * doğrulanır. Eskiden her telefon 10 sn'de bir ve her heartbeat'te okuyordu.
 *
 * `null` = henüz bilinmiyor. Çağıranlar ilk okuma gelene kadar yanlış uyarı
 * göstermemek için bunu "açık" gibi ele almalı.
 */
export function usePlayerOnline(venueDbId: string | null | undefined): boolean | null {
  const supabase = useMemo(() => createClient(), []);
  const [lastBeat, setLastBeat] = useState<string | null | undefined>(undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const lastBeatRef = useRef<string | null | undefined>(undefined);
  const fetchBeatRef = useRef<() => void>(() => {});

  const applyBeat = (value: string | null) => {
    lastBeatRef.current = value;
    setLastBeat(value);
    setNowMs(Date.now());
  };

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;
    let lastConfirmAt = 0;

    const fetchBeat = async () => {
      lastConfirmAt = Date.now();
      const { data, error } = await supabase
        .from("now_playing")
        .select("last_heartbeat_at")
        .eq("venue_id", venueDbId)
        .maybeSingle();
      if (cancelled) return;
      // Geçici bir okuma hatası "player kapalı" demek değil: eldeki değeri koru,
      // yoksa tek bir ağ tökezlemesi ekleme kilidini yanlışlıkla kapatıyor
      if (error) return;
      applyBeat((data as { last_heartbeat_at: string | null } | null)?.last_heartbeat_at ?? null);
    };
    fetchBeatRef.current = fetchBeat;

    fetchBeat();

    const interval = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      const known = lastBeatRef.current;
      if (known !== undefined && !isPlayerOnline(known, now) && now - lastConfirmAt >= STALE_CONFIRM_MS) {
        fetchBeat();
      }
    }, RECHECK_MS);

    const onOnline = () => fetchBeat();
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      fetchBeatRef.current = () => {};
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [venueDbId, supabase]);

  useVenueLive(venueDbId, (event, payload) => {
    if (event === "beat" || event === "np") {
      const at = payload.last_heartbeat_at;
      if (typeof at === "string" || at === null) applyBeat(at);
    } else if (event === "resync") {
      fetchBeatRef.current();
    } else if (event === "ready") {
      // Açılış okuması ile abonelik arasında player açıldıysa `beat` kaçmıştır;
      // "kapalı" (ya da henüz bilinmeyen) değer kilidi 30 sn'lik doğrulamaya
      // kadar kapalı tutmasın
      const known = lastBeatRef.current;
      if (known === undefined || !isPlayerOnline(known)) fetchBeatRef.current();
    }
  });

  if (lastBeat === undefined) return null;
  return isPlayerOnline(lastBeat, nowMs);
}
