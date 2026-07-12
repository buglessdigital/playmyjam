"use client";

import { useState, useEffect, useMemo, use, Suspense } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type QueueItem = {
  id: string;
  added_by: string;
  tokens_spent: number;
  priority: boolean;
  position: number;
  added_at: string;
  songs: { title: string; artist: string; album_cover_url: string; duration_ms: number };
};

type NowPlaying = {
  is_playing: boolean;
  progress_ms: number;
  started_at: string | null;
  last_heartbeat_at: string | null;
  songs: { title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

const QUEUE_SELECT =
  "id, added_by, tokens_spent, priority, position, added_at, songs(title, artist, album_cover_url, duration_ms)";

// Player 15 sn'de bir heartbeat yollar — bunun ~3 katı sessizlik "çevrimdışı" sayılır
const OFFLINE_AFTER_MS = 45_000;

export default function AdminDashboard({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <AdminDashboardContent params={params} />
    </Suspense>
  );
}

function AdminDashboardContent({ params }: Props) {
  const { venueId } = use(params);
  const [venueDbId, setVenueDbId] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const [playerLoading, setPlayerLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const load = async () => {
      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("slug", venueId)
        .single();
      if (cancelled || !venue) return;
      const dbId: string = venue.id;
      setVenueDbId(dbId);

      // Şu an çalan: Spotify'a sormak yerine now_playing tablosu Realtime ile izlenir
      const fetchNowPlaying = async () => {
        const { data } = await supabase
          .from("now_playing")
          .select("is_playing, progress_ms, started_at, last_heartbeat_at, songs(title, artist, album_cover_url, duration_ms)")
          .eq("venue_id", dbId)
          .maybeSingle();
        if (cancelled || !data) return;
        const raw = data as unknown as Omit<NowPlaying, "songs"> & { songs: NowPlaying["songs"] | NowPlaying["songs"][] };
        const songs = Array.isArray(raw.songs) ? raw.songs[0] ?? null : raw.songs;
        setNowPlaying({ ...raw, songs });
        // İlerlemeyi started_at çapasından hesapla — progress_ms yazıldığı andan itibaren bayat
        if (raw.is_playing && raw.started_at) {
          setProgress(Math.max(Date.now() - Date.parse(raw.started_at), 0));
        } else {
          setProgress(raw.progress_ms ?? 0);
        }
      };

      const fetchQueue = async () => {
        const { data } = await supabase
          .from("queue")
          .select(QUEUE_SELECT)
          .eq("venue_id", dbId)
          .eq("status", "queued")
          .order("priority", { ascending: false })
          .order("position", { ascending: true });
        if (!cancelled && data) setQueue(data as unknown as QueueItem[]);
      };

      fetchNowPlaying();
      fetchQueue();

      channels.push(
        supabase
          .channel(`admin-np:${dbId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${dbId}` }, fetchNowPlaying)
          .subscribe(),
        supabase
          .channel(`admin-queue:${dbId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${dbId}` }, fetchQueue)
          .subscribe()
      );
    };

    load();

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [venueId, supabase]);

  // Progress + heartbeat tazeliği için saniyelik tick
  useEffect(() => {
    if (!nowPlaying) return;
    const interval = setInterval(() => {
      setNow(Date.now());
      if (nowPlaying.is_playing) {
        const dur = nowPlaying.songs?.duration_ms ?? 0;
        if (nowPlaying.started_at) {
          setProgress(Math.min(Math.max(Date.now() - Date.parse(nowPlaying.started_at), 0), dur));
        } else {
          setProgress((p) => Math.min(p + 1000, dur));
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying]);

  const playerAction = async (action: "play" | "pause" | "next") => {
    if (!venueDbId) return;
    setPlayerLoading(action);
    try {
      await fetch(`/api/player/${venueDbId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } finally {
      setPlayerLoading(null);
    }
  };

  const removeFromQueue = async (id: string) => {
    const res = await fetch("/api/admin/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue_id: id, status: "removed" }),
    });
    if (res.ok) {
      setQueue((prev) => prev.filter((q) => q.id !== id));
    }
  };

  const dur = nowPlaying?.songs?.duration_ms ?? 1;
  const progressPct = Math.min((progress / dur) * 100, 100);
  const isPlaying = nowPlaying?.is_playing ?? false;

  // Player sekmesi hiç açılmadıysa ya da heartbeat kesildiyse uyar
  const heartbeatAge = nowPlaying?.last_heartbeat_at
    ? now - Date.parse(nowPlaying.last_heartbeat_at)
    : Infinity;
  const playerOffline = heartbeatAge > OFFLINE_AFTER_MS;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="text-white font-bold text-2xl mb-6">Ana Ekran</h1>

      {/* Şu An Çalıyor */}
      <div className="rounded-2xl border border-white/10 p-5 mb-6" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[#9ca3af] text-xs font-medium uppercase tracking-wide">Şu An Çalıyor</p>
          <a
            href={`/admin/${venueId}/player`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
            style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M10 9l4 2.5-4 2.5V9z" fill="currentColor" /></svg>
            Player&apos;ı Aç
          </a>
        </div>

        {playerOffline && (
          <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 mb-4" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <p className="text-xs" style={{ color: "#fbbf24" }}>
              Oynatıcı çevrimdışı görünüyor. Mekan ekranındaki cihazda <span className="font-bold">Player sayfasını</span> açık tutun; müzik oradan çalar.
            </p>
          </div>
        )}

        {nowPlaying?.songs ? (
          <div>
            <div className="flex items-center gap-4 mb-4">
              {nowPlaying.songs.album_cover_url && (
                <Image src={nowPlaying.songs.album_cover_url} alt="" width={64} height={64} className="w-16 h-16 rounded-xl object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-base truncate">{nowPlaying.songs.title}</p>
                <p className="text-[#9ca3af] text-sm">{nowPlaying.songs.artist}</p>
                <div className="mt-2">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #e91e8c, #8b5cf6)" }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[#6b7280] text-xs">{formatTime(progress)}</span>
                    <span className="text-[#6b7280] text-xs">{formatTime(dur === 1 ? 0 : dur)}</span>
                  </div>
                </div>
              </div>
              {isPlaying && !playerOffline && <span className="text-xs px-2 py-1 rounded-full font-medium shrink-0" style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>CANLI</span>}
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => playerAction(isPlaying ? "pause" : "play")}
                disabled={playerLoading !== null}
                className="w-12 h-12 flex items-center justify-center rounded-full transition-all disabled:opacity-40"
                style={{ background: "#e91e8c" }}
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              <button
                onClick={() => playerAction("next")}
                disabled={playerLoading !== null}
                className="w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-white/10 disabled:opacity-40"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.5v-7L8.5 12zM16 6h2v12h-2z" /></svg>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[#6b7280] text-sm">Şu an çalan şarkı yok — kuyruğa şarkı eklenince Player&apos;da otomatik başlar</p>
        )}
      </div>

      {/* Kuyruk */}
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <p className="text-white font-semibold text-sm">Kuyruk</p>
          <span className="text-[#6b7280] text-xs">{queue.length} şarkı</span>
        </div>

        {queue.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#6b7280] text-sm">Kuyruk boş</div>
        ) : (
          <div>
            {queue.map((item, i) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors" style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
                <span className="text-[#6b7280] text-xs w-5 shrink-0">{i + 1}</span>
                {item.songs.album_cover_url ? (
                  <Image src={item.songs.album_cover_url} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/10 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.songs.title}</p>
                  <p className="text-[#6b7280] text-xs">{item.songs.artist} · {item.added_by} · {item.tokens_spent} jeton</p>
                </div>
                {item.priority && <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>Önce</span>}
                <button onClick={() => removeFromQueue(item.id)} className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-all hover:bg-red-500/20" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
