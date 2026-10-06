"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Müşteri ekranlarının TEK canlı hattı: `venue-live:<venue_id>` Broadcast kanalı.
 *
 * Mesajları veritabanı tetikleyicileri yollar (bkz. 0060_venue_live_broadcast.sql)
 * ve yalnızca müşterinin gördüğü bir şey değiştiğinde gider:
 *   queue    — kuyruk değişti (deyim başına bir kez; INSERT'te `added` listesi)
 *   np       — çalan şarkı / çal-duraklat / çapa kayması
 *   beat     — oynatıcı canlı (20 sn'de bir; veri çekmeyi TETİKLEMEMELİ)
 *   catalog  — müşterinin seçebileceği katalog değişti (play_count sayılmaz)
 *   one_time — onaylı talebin tek seferlik hakkı açıldı/tüketildi
 *   ready    — istemcinin kendi olayı: kanal İLK kez abone oldu. Açılış okuması
 *              ile abonelik arasındaki (~1 sn) mesajlar kaçmış olabilir; yarışın
 *              pahalı olduğu yerde (oynatıcı-açık kilidi) bir kez doğrulanır
 *   resync   — istemcinin kendi olayı: bağlantı koptu-döndü ya da sekme uzun
 *              süre gizli kaldı, aradaki mesajlar kaçmış olabilir → kaynaktan oku
 *
 * Eskiden her ekran tablolara ayrı ayrı postgres_changes ile abone olup her
 * satır değişikliğinde (5 sn'lik heartbeat dahil) yeniden okuyordu; yük
 * mekandaki telefon sayısıyla çarpılıyordu.
 *
 * Aynı sayfadaki bütün bileşenler tek kanalı paylaşır: supabase-js aynı konuya
 * ikinci kanalı açmıyor, mevcudu geri veriyor (abone olunmuş kanala da yeni
 * dinleyici eklenemez). Son dinleyici gidince kanal hemen kapanmaz — sayfalar
 * arası geçişte (gözat → sıra) yeniden abone olmak gerekmesin.
 */

export type VenueLiveEvent = "queue" | "np" | "beat" | "catalog" | "one_time" | "ready" | "resync";
export type VenueLivePayload = Record<string, unknown>;
type Listener = (event: VenueLiveEvent, payload: VenueLivePayload) => void;

/** Son dinleyici gittikten sonra kanalın açık tutulduğu süre. */
const TEARDOWN_GRACE_MS = 5_000;
/** Sekme bu süreden uzun gizli kaldıysa görünür olunca resync gönderilir. */
const HIDDEN_RESYNC_MS = 30_000;

type Channel = ReturnType<ReturnType<typeof createClient>["channel"]>;

type Entry = {
  listeners: Set<Listener>;
  channel: Channel | null;
  subscribedOnce: boolean;
  teardownTimer: ReturnType<typeof setTimeout> | null;
  hiddenAt: number | null;
  onVisibility: () => void;
};

const entries = new Map<string, Entry>();
// Kapanmakta olan kanal: aynı konu yeniden istenirse supabase-js kapanan kanalı
// geri verir. Yeni kanal ancak kapanış bitince açılır.
const closing = new Map<string, Promise<unknown>>();

function dispatch(entry: Entry, event: VenueLiveEvent, payload: VenueLivePayload) {
  for (const listener of [...entry.listeners]) {
    try {
      listener(event, payload);
    } catch (e) {
      console.error("[venue-live] dinleyici hatası:", e);
    }
  }
}

function openChannel(venueDbId: string, entry: Entry) {
  const supabase = createClient();
  entry.channel = supabase
    .channel(`venue-live:${venueDbId}`)
    .on("broadcast", { event: "*" }, (msg: { event: string; payload?: VenueLivePayload }) => {
      dispatch(entry, msg.event as VenueLiveEvent, msg.payload ?? {});
    })
    .subscribe((status: string) => {
      if (status !== "SUBSCRIBED") return;
      // İlk abonelik ekranların açılış okumasıyla aynı ana denk gelir (ready);
      // kopup dönen bağlantıda ise aradaki bütün mesajlar kayıptır (resync).
      dispatch(entry, entry.subscribedOnce ? "resync" : "ready", {});
      entry.subscribedOnce = true;
    });
}

function acquire(venueDbId: string): Entry {
  const existing = entries.get(venueDbId);
  if (existing) {
    if (existing.teardownTimer) {
      clearTimeout(existing.teardownTimer);
      existing.teardownTimer = null;
    }
    return existing;
  }

  const entry: Entry = {
    listeners: new Set(),
    channel: null,
    subscribedOnce: false,
    teardownTimer: null,
    hiddenAt: null,
    onVisibility: () => {
      if (document.visibilityState === "hidden") {
        entry.hiddenAt = Date.now();
        return;
      }
      const hiddenFor = entry.hiddenAt === null ? 0 : Date.now() - entry.hiddenAt;
      entry.hiddenAt = null;
      // Uyuyan telefonda soket çoğu zaman sessizce düşer; uyanınca kaçan
      // değişiklikler için bir kez kaynaktan okunur
      if (hiddenFor > HIDDEN_RESYNC_MS) dispatch(entry, "resync", {});
    },
  };
  entries.set(venueDbId, entry);
  document.addEventListener("visibilitychange", entry.onVisibility);

  const pending = closing.get(venueDbId);
  if (pending) {
    pending.finally(() => {
      if (entries.get(venueDbId) === entry && !entry.channel) openChannel(venueDbId, entry);
    });
  } else {
    openChannel(venueDbId, entry);
  }
  return entry;
}

function release(venueDbId: string, entry: Entry) {
  if (entry.listeners.size > 0 || entry.teardownTimer) return;
  entry.teardownTimer = setTimeout(() => {
    entry.teardownTimer = null;
    if (entry.listeners.size > 0 || entries.get(venueDbId) !== entry) return;
    entries.delete(venueDbId);
    document.removeEventListener("visibilitychange", entry.onVisibility);
    if (entry.channel) {
      const done = createClient()
        .removeChannel(entry.channel)
        .catch(() => undefined)
        .finally(() => {
          if (closing.get(venueDbId) === done) closing.delete(venueDbId);
        });
      closing.set(venueDbId, done);
    }
  }, TEARDOWN_GRACE_MS);
}

/** Mekanın canlı hattını dinler; dönen fonksiyon aboneliği bırakır. */
export function subscribeVenueLive(venueDbId: string, listener: Listener): () => void {
  const entry = acquire(venueDbId);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    release(venueDbId, entry);
  };
}

/**
 * React kancası. `handler` her render'da değişebilir — son hali çağrılır,
 * abonelik yalnızca mekan değişince yenilenir.
 */
export function useVenueLive(
  venueDbId: string | null | undefined,
  handler: (event: VenueLiveEvent, payload: VenueLivePayload) => void
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!venueDbId) return;
    return subscribeVenueLive(venueDbId, (event, payload) => handlerRef.current(event, payload));
  }, [venueDbId]);
}

/**
 * Yeniden okumayı toplar ve yayar. Tek değişiklik çoğu zaman art arda birkaç
 * mesaj üretir (şarkı geçişi: kuyruk + çalan şarkı) — pencere içindekiler tek
 * okumaya iner. Rastgele gecikme mekandaki bütün telefonların aynı milisaniyede
 * veritabanına yüklenmesini önler.
 */
export function coalesce(fn: () => void, baseMs = 150, jitterMs = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const trigger = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, baseMs + Math.random() * jitterMs);
  };
  trigger.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return trigger;
}
