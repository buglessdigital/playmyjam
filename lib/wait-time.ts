"use client";

import { useEffect, useState } from "react";
import type { createClient } from "@/lib/supabase/client";

/**
 * Bekleme süresinin tek kaynağı. Kuyruk sayfası, şarkı detayı, gözat ve ekleme
 * sheet'i aynı girdileri aynı formülle çevirsin diye hesap da biçim de burada.
 *
 * Formül: çalan şarkının kalan süresi + önünde çalacak şarkıların toplam süresi.
 *   - Normal sıra  → kuyruktaki tüm müşteri şarkıları
 *   - Öncelikli sıra → yalnızca priority=true müşteri şarkıları
 *
 * Auto-fill kayıtları (user_id null, position >= 9000) hesaba katılmaz: yeni
 * gelen her müşteri şarkısı onların önüne geçtiği için beklemeyi uzatmazlar.
 */

/** Auto-fill kuyruk kayıtları bu pozisyondan başlar (bkz. lib/queue-fill.ts). */
export const AUTO_FILL_POSITION_BASE = 9000;

export type WaitEntry = { priority: boolean; duration_ms: number | null };

export type NowPlayingClock =
  | {
      duration_ms: number | null;
      progress_ms: number | null;
      is_playing: boolean;
      /** Heartbeat "now - progress" olarak yazar: bayatlamayan duvar saati çapası. */
      started_at?: string | null;
    }
  | null
  | undefined;

/**
 * Çalan şarkının gerçek konumu. progress_ms 15 sn'de bir yazıldığı için tek
 * başına bayat; started_at çapası varsa konum her zaman ondan hesaplanır.
 */
export function nowPlayingProgressMs(np: NowPlayingClock, nowMs: number = Date.now()): number {
  const duration = np?.duration_ms ?? 0;
  if (!np || duration <= 0) return 0;
  const anchorMs = np.is_playing && np.started_at ? Date.parse(np.started_at) : NaN;
  const raw = Number.isFinite(anchorMs) ? nowMs - anchorMs : np.progress_ms ?? 0;
  return Math.min(Math.max(raw, 0), duration);
}

export function nowPlayingRemainingMs(np: NowPlayingClock, nowMs: number = Date.now()): number {
  const duration = np?.duration_ms ?? 0;
  if (!np || duration <= 0) return 0;
  return Math.max(duration - nowPlayingProgressMs(np, nowMs), 0);
}

export function sumDurations(entries: WaitEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0);
}

/** Şimdi eklenecek bir şarkının çalmaya başlamasına kalan süre. */
export function waitMs(remainingCurrentMs: number, entries: WaitEntry[], priority: boolean): number {
  const ahead = priority ? entries.filter((e) => e.priority) : entries;
  return remainingCurrentMs + sumDurations(ahead);
}

/** Tüm ekranlarda aynı biçim: "Hemen" / "~45 sn" / "~7 dk" / "~1 sa 12 dk". */
export function formatWait(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "Hemen";
  if (ms < 60_000) return `~${Math.max(Math.ceil(ms / 1000), 1)} sn`;
  const totalMin = Math.max(Math.round(ms / 60_000), 1);
  if (totalMin < 60) return `~${totalMin} dk`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `~${hours} sa` : `~${hours} sa ${mins} dk`;
}

/**
 * Çalan şarkının ilerlemesini duvar saatine sabitleyip saniyede iki kez tazeler.
 * Interval sürüklenmesi ve bayat progress_ms sorunu olmaz; duraklatılmışken
 * tick de çalışmaz.
 */
export function useNowPlayingClock(np: NowPlayingClock, tickMs = 500) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const durationMs = np?.duration_ms ?? 0;
  const isPlaying = !!np?.is_playing && durationMs > 0;

  // Duraklatılmışken konum progress_ms'ten okunur, saatin ilerlemesine gerek yok
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(interval);
  }, [isPlaying, tickMs]);

  const progressMs = nowPlayingProgressMs(np, nowMs);
  return { progressMs, remainingMs: Math.max(durationMs - progressMs, 0), durationMs };
}

/**
 * Kuyruktaki müşteri şarkılarının tamamı. get_queue_state yalnızca ilk 10 kaydı
 * döndürüp auto-fill'i de içerdiğinden bekleme süresi ondan hesaplanamaz.
 */
export async function fetchManualQueueEntries(
  supabase: ReturnType<typeof createClient>,
  venueDbId: string
): Promise<WaitEntry[]> {
  const { data } = await supabase
    .from("queue")
    .select("priority, songs(duration_ms)")
    .eq("venue_id", venueDbId)
    .eq("status", "queued")
    .not("user_id", "is", null)
    .lt("position", AUTO_FILL_POSITION_BASE);

  type Row = { priority: boolean; songs: { duration_ms: number | null } | { duration_ms: number | null }[] | null };
  return ((data ?? []) as Row[]).map((row) => {
    const song = Array.isArray(row.songs) ? row.songs[0] : row.songs;
    return { priority: row.priority, duration_ms: song?.duration_ms ?? 0 };
  });
}
