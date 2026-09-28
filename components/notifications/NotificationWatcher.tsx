"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveVenueDbId } from "@/lib/venue-db-id";
import { getNotifPref, notify, type NotifPref } from "@/lib/notifications";
import { currentDict, fmt } from "@/lib/i18n";
import { coalesce, subscribeVenueLive } from "@/lib/venue-live";

// Venue sayfaları açıkken kuyruğu izler ve tarayıcı bildirimi gönderir:
// - "nearby": kullanıcının şarkısı sıranın başına geldiğinde (çalmak üzere)
// - "queue": kuyruğa başkası şarkı eklediğinde
export default function NotificationWatcher({ venueId }: { venueId: string }) {
  const notifiedSongs = useRef<Set<string>>(new Set());
  const prefs = useRef<Record<NotifPref, boolean>>({ nearby: true, queue: false, push: false });

  useEffect(() => {
    prefs.current = { nearby: getNotifPref("nearby"), queue: getNotifPref("queue"), push: getNotifPref("push") };
    const onPrefChange = (e: Event) => {
      const { pref, value } = (e as CustomEvent).detail as { pref: NotifPref; value: boolean };
      prefs.current[pref] = value;
    };
    window.addEventListener("pmj-notif-pref-changed", onPrefChange);
    return () => window.removeEventListener("pmj-notif-pref-changed", onPrefChange);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let stop: (() => void) | null = null;

    const checkMySongUpNext = async (venueDbId: string, userId: string) => {
      const { data } = await supabase
        .from("queue")
        .select("id, user_id, songs(title, artist)")
        .eq("venue_id", venueDbId)
        .eq("status", "queued")
        // Sıra anahtarı lib/queue.ts ile birebir aynı olmalı — yoksa "sıradaki
        // şarkın" bildirimi başka satır için gidebilir (beraberlik kırıcı: 0034)
        .order("priority", { ascending: false })
        .order("position", { ascending: true })
        .order("added_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);
      if (cancelled || !data || data.length === 0) return;

      const next = data[0] as unknown as { id: string; user_id: string; songs: { title: string; artist: string } | null };
      if (next.user_id !== userId) return;
      if (notifiedSongs.current.has(next.id)) return;

      notifiedSongs.current.add(next.id);
      if (prefs.current.nearby) {
        notify(currentDict().notifications.soonTitle, next.songs ? fmt(currentDict().notifications.soonBody, { title: next.songs.title, artist: next.songs.artist }) : currentDict().notifications.soonBodyFallback);
      }
    };

    const load = async () => {
      // `or(id.eq.<slug>,...)` uuid kolonuna metin gönderip 400 dönüyordu:
      // sorgu hep boş kaldığı için bu izleyici hiç kurulmuyordu (sessiz hata).
      const venueDbId = await resolveVenueDbId(venueId);
      if (cancelled || !venueDbId) return;
      const venueRow = { id: venueDbId };

      // getSession lokal cache'ten okur — ağ çağrısı yapmaz
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (cancelled || !user) return;

      // Sayfa açıldığında şarkı zaten sıradaysa da haber ver
      checkMySongUpNext(venueRow.id, user.id);

      // Kuyruk değişikliği mekanın canlı hattından gelir (bkz. lib/venue-live.ts).
      // Eskiden satır başına postgres_changes olayıydı ve DELETE filtrelenemediği
      // için BÜTÜN mekanlardaki silmeler her telefona ulaşıyordu.
      const refreshUpNext = coalesce(() => checkMySongUpNext(venueRow.id, user.id));
      const unsubscribe = subscribeVenueLive(venueRow.id, (event, payload) => {
        if (event !== "queue" && event !== "resync") return;
        refreshUpNext();
        // Kendi eklediğin şarkı için kuyruk bildirimi atma
        const added = Array.isArray(payload.added) ? (payload.added as { user_id?: string; song_id?: string }[]) : [];
        const other = added.find((row) => row.user_id !== user.id && row.song_id);
        if (event === "queue" && prefs.current.queue && other?.song_id) {
          void supabase
            .from("songs")
            .select("title, artist")
            .eq("id", other.song_id)
            .single()
            .then(({ data: song }: { data: { title: string; artist: string } | null }) => {
              if (cancelled) return;
              notify(currentDict().notifications.queueTitle, song ? fmt(currentDict().notifications.queueBody, { title: song.title, artist: song.artist }) : currentDict().notifications.queueBodyFallback);
            });
        }
      });
      stop = () => {
        refreshUpNext.cancel();
        unsubscribe();
      };
    };
    load();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [venueId]);

  return null;
}
