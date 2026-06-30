"use client";

import { useState, useEffect, useRef, useMemo, useCallback, use, Suspense } from "react";
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

type SpotifyNowPlaying = {
  is_playing: boolean;
  title?: string;
  artist?: string;
  album_cover_url?: string;
  progress_ms?: number;
  duration_ms?: number;
  error?: string;
};

const QUEUE_SELECT =
  "id, added_by, tokens_spent, priority, position, added_at, songs(title, artist, album_cover_url, duration_ms)";

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
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyAccount, setSpotifyAccount] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [spotifyNowPlaying, setSpotifyNowPlaying] = useState<SpotifyNowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const [playerLoading, setPlayerLoading] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchNowPlaying = useCallback(async (dbId: string) => {
    try {
      // Sync: Spotify durumunu Supabase'e yansıt + kuyrukta şarkı varsa otomatik başlat
      await fetch(`/api/spotify/sync/${dbId}`, { method: "POST" });
      const res = await fetch(`/api/spotify/now-playing/${dbId}`);
      const data: SpotifyNowPlaying = await res.json();
      if (!data.error) {
        setSpotifyNowPlaying(data);
        if (data.progress_ms !== undefined) setProgress(data.progress_ms);
      }
    } catch {
      // sessizce geç
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      // Spotify bağlantı durumu sunucudan gelir — refresh token tarayıcıya inmez
      const statusRes = await fetch("/api/admin/spotify-status").catch(() => null);
      const status = statusRes?.ok ? await statusRes.json().catch(() => null) : null;
      if (cancelled || !status?.venue_id) return;

      const dbId: string = status.venue_id;
      setVenueDbId(dbId);

      const connected = !!status.connected;
      setSpotifyConnected(connected);
      setSpotifyAccount(status.account_name ?? null);

      if (connected) {
        await fetchNowPlaying(dbId);
        if (cancelled) return;
        pollRef.current = setInterval(() => fetchNowPlaying(dbId), 5000);
      }

      const { data: q } = await supabase
        .from("queue")
        .select(QUEUE_SELECT)
        .eq("venue_id", dbId)
        .eq("status", "queued")
        .order("priority", { ascending: false })
        .order("position", { ascending: true });
      if (cancelled) return;
      if (q) setQueue(q as unknown as QueueItem[]);

      channel = supabase.channel(`admin-queue:${dbId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${dbId}` }, async () => {
          const { data } = await supabase
            .from("queue")
            .select(QUEUE_SELECT)
            .eq("venue_id", dbId)
            .eq("status", "queued")
            .order("priority", { ascending: false })
            .order("position", { ascending: true });
          if (data) setQueue(data as unknown as QueueItem[]);
        })
        .subscribe();
    };

    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [venueId, supabase, fetchNowPlaying]);

  // Progress timer (Spotify'dan gelen is_playing'e göre)
  useEffect(() => {
    if (!spotifyNowPlaying?.is_playing) return;
    const dur = spotifyNowPlaying.duration_ms ?? 0;
    const interval = setInterval(() => setProgress((p) => Math.min(p + 1000, dur)), 1000);
    return () => clearInterval(interval);
  }, [spotifyNowPlaying?.is_playing, spotifyNowPlaying?.title, spotifyNowPlaying?.duration_ms]);

  const playerAction = async (action: "play" | "pause" | "next" | "previous") => {
    if (!venueDbId) return;
    setPlayerLoading(action);
    try {
      await fetch(`/api/spotify/player/${venueDbId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setTimeout(() => fetchNowPlaying(venueDbId), 500);
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

  const dur = spotifyNowPlaying?.duration_ms ?? 1;
  const progressPct = Math.min((progress / dur) * 100, 100);
  const isPlaying = spotifyNowPlaying?.is_playing ?? false;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="text-white font-bold text-2xl mb-6">Ana Ekran</h1>

      {/* Şu An Çalıyor */}
      <div className="rounded-2xl border border-white/10 p-5 mb-6" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[#9ca3af] text-xs font-medium uppercase tracking-wide">Şu An Çalıyor</p>
          {spotifyConnected && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#1DB954]">{spotifyAccount ? `Spotify: ${spotifyAccount}` : "Spotify bağlı"}</span>
              <a
                href={`/api/spotify/auth?venueId=${venueDbId}`}
                className="text-[#9ca3af] underline hover:text-white transition-colors"
              >
                Değiştir
              </a>
            </div>
          )}
        </div>

        {!spotifyConnected ? (
          <div className="flex items-center justify-between">
            <p className="text-[#6b7280] text-sm">Spotify hesabı bağlı değil</p>
            <a
              href={`/api/spotify/auth?venueId=${venueDbId}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "#1DB954", color: "white" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
              Spotify Bağla
            </a>
          </div>
        ) : spotifyNowPlaying?.title ? (
          <div>
            <div className="flex items-center gap-4 mb-4">
              {spotifyNowPlaying.album_cover_url && (
                <Image src={spotifyNowPlaying.album_cover_url} alt="" width={64} height={64} className="w-16 h-16 rounded-xl object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-base truncate">{spotifyNowPlaying.title}</p>
                <p className="text-[#9ca3af] text-sm">{spotifyNowPlaying.artist}</p>
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
              {isPlaying && <span className="text-xs px-2 py-1 rounded-full font-medium shrink-0" style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>CANLI</span>}
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => playerAction("previous")}
                disabled={playerLoading !== null}
                className="w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-white/10 disabled:opacity-40"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
              </button>

              <button
                onClick={() => playerAction(isPlaying ? "pause" : "play")}
                disabled={playerLoading !== null}
                className="w-12 h-12 flex items-center justify-center rounded-full transition-all disabled:opacity-40"
                style={{ background: "#e91e8c" }}
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>

              <button
                onClick={() => playerAction("next")}
                disabled={playerLoading !== null}
                className="w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-white/10 disabled:opacity-40"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.5v-7L8.5 12zM16 6h2v12h-2z"/></svg>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[#6b7280] text-sm">Şu an Spotify&apos;da çalan şarkı yok</p>
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
