"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { getNotifPref, notify, type NotifPref } from "@/lib/notifications";

// Venue sayfaları açıkken kuyruğu izler ve tarayıcı bildirimi gönderir:
// - "nearby": kullanıcının şarkısı sıranın başına geldiğinde (çalmak üzere)
// - "queue": kuyruğa başkası şarkı eklediğinde
export default function NotificationWatcher({ venueId }: { venueId: string }) {
  const notifiedSongs = useRef<Set<string>>(new Set());
  const prefs = useRef<Record<NotifPref, boolean>>({ nearby: true, queue: false });

  useEffect(() => {
    prefs.current = { nearby: getNotifPref("nearby"), queue: getNotifPref("queue") };
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
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const checkMySongUpNext = async (venueDbId: string, userId: string) => {
      const { data } = await supabase
        .from("queue")
        .select("id, user_id, songs(title, artist)")
        .eq("venue_id", venueDbId)
        .eq("status", "queued")
        .order("priority", { ascending: false })
        .order("position", { ascending: true })
        .limit(1);
      if (cancelled || !data || data.length === 0) return;

      const next = data[0] as unknown as { id: string; user_id: string; songs: { title: string; artist: string } | null };
      if (next.user_id !== userId) return;
      if (notifiedSongs.current.has(next.id)) return;

      notifiedSongs.current.add(next.id);
      if (prefs.current.nearby) {
        notify("Şarkın çalmak üzere! 🎵", next.songs ? `${next.songs.title} — ${next.songs.artist} sırada bir sonraki şarkı` : "Şarkın sırada bir sonraki");
      }
    };

    const load = async () => {
      const { data: venueRow } = await supabase.from("venues").select("id").or(`id.eq.${venueId},slug.eq.${venueId}`).single();
      if (cancelled || !venueRow) return;

      // getSession lokal cache'ten okur — ağ çağrısı yapmaz
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (cancelled || !user) return;

      // Sayfa açıldığında şarkı zaten sıradaysa da haber ver
      checkMySongUpNext(venueRow.id, user.id);

      channel = supabase
        .channel(`notif:${venueRow.id}:${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "queue", filter: `venue_id=eq.${venueRow.id}` }, async (payload: { new: unknown }) => {
          const row = payload.new as { user_id?: string; song_id?: string };
          // Kendi eklediğin şarkı için kuyruk bildirimi atma
          if (prefs.current.queue && row.user_id !== user.id && row.song_id) {
            const { data: song } = await supabase.from("songs").select("title, artist").eq("id", row.song_id).single();
            if (!cancelled) {
              notify("Kuyruk güncellendi", song ? `${song.title} — ${song.artist} kuyruğa eklendi` : "Kuyruğa yeni bir şarkı eklendi");
            }
          }
          checkMySongUpNext(venueRow.id, user.id);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "queue", filter: `venue_id=eq.${venueRow.id}` }, () => {
          checkMySongUpNext(venueRow.id, user.id);
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "queue" }, () => {
          checkMySongUpNext(venueRow.id, user.id);
        })
        .subscribe();
    };
    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId]);

  return null;
}
