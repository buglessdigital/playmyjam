"use client";

import { useState, useEffect, useMemo, use, Suspense } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import YouTubePlayer from "@/components/player/YouTubePlayer";

interface Props {
  params: Promise<{ venueId: string }>;
}

type NowPlayingSong = { title: string; artist: string } | null;

type QueueItem = {
  id: string;
  priority: boolean;
  songs: { title: string; artist: string; album_cover_url: string } | null;
};

const QUEUE_SELECT = "id, priority, songs(title, artist, album_cover_url)";

// Mekanın TV/ekrana bağlı cihazında tam ekran açılır: video + sıradakiler.
// Video alanının üstüne hiçbir şey bindirilmez (YouTube API kuralı).
export default function PlayerPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PlayerPageContent params={params} />
    </Suspense>
  );
}

function PlayerPageContent({ params }: Props) {
  const { venueId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [venueDbId, setVenueDbId] = useState("");
  const [venueName, setVenueName] = useState("");
  const [current, setCurrent] = useState<NowPlayingSong>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const load = async () => {
      const { data: venue } = await supabase
        .from("venues")
        .select("id, name")
        .eq("slug", venueId)
        .single();
      if (cancelled || !venue) return;
      setVenueDbId(venue.id);
      setVenueName(venue.name);

      const fetchCurrent = async () => {
        const { data } = await supabase
          .from("now_playing")
          .select("songs(title, artist)")
          .eq("venue_id", venue.id)
          .maybeSingle();
        if (cancelled) return;
        const rel = data?.songs as unknown as NowPlayingSong | NowPlayingSong[];
        setCurrent(Array.isArray(rel) ? rel[0] ?? null : rel ?? null);
      };

      const fetchQueue = async () => {
        const { data } = await supabase
          .from("queue")
          .select(QUEUE_SELECT)
          .eq("venue_id", venue.id)
          .eq("status", "queued")
          .order("priority", { ascending: false })
          .order("position", { ascending: true })
          .limit(6);
        if (!cancelled && data) setQueue(data as unknown as QueueItem[]);
      };

      fetchCurrent();
      fetchQueue();

      channels.push(
        supabase
          .channel(`player-page-np:${venue.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venue.id}` }, fetchCurrent)
          .subscribe(),
        supabase
          .channel(`player-page-queue:${venue.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venue.id}` }, fetchQueue)
          .subscribe()
      );
    };
    load();

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [venueId, supabase]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#0f0a18] p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{venueName}</p>
          <h1 className="truncate text-lg font-bold text-white">
            {current ? `${current.title} — ${current.artist}` : "Play My Jam"}
          </h1>
        </div>
        <a
          href={`/admin/${venueId}`}
          className="shrink-0 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-[#9ca3af] transition-colors hover:text-white"
        >
          Panele Dön
        </a>
      </div>

      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        <div className="flex-1">
          {venueDbId && <YouTubePlayer venueDbId={venueDbId} />}
        </div>

        {/* Sıradakiler — videonun yanında, asla üstünde değil */}
        <aside className="w-full shrink-0 lg:w-72">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6b7280]">
            Sıradakiler
          </p>
          {queue.length === 0 ? (
            <p className="text-sm text-[#6b7280]">Kuyruk boş</p>
          ) : (
            <div className="space-y-2">
              {queue.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2">
                  <span className="w-4 shrink-0 text-xs text-[#6b7280]">{i + 1}</span>
                  {item.songs?.album_cover_url ? (
                    <Image
                      src={item.songs.album_cover_url}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{item.songs?.title}</p>
                    <p className="truncate text-xs text-[#6b7280]">{item.songs?.artist}</p>
                  </div>
                  {item.priority && (
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-xs" style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>
                      Önce
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
