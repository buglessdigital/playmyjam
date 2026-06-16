"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import SongDetailModal, { type SongDetail } from "@/components/queue/SongDetailModal";

type QueueItem = {
  id: string;
  song_id: string;
  added_by: string;
  tokens_spent: number;
  priority: boolean;
  position: number;
  added_at: string;
  songs: { title: string; artist: string; album_cover_url: string; duration_ms: number };
};

type NowPlaying = {
  song_id: string | null;
  progress_ms: number;
  is_playing: boolean;
  started_at: string | null;
  songs: { title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

interface Props {
  venueId: string;
  initialVenueName: string;
  initialVenueDbId: string;
  initialNowPlaying: NowPlaying | null;
  initialQueue: QueueItem[];
}

export default function QueueClient({ venueId, initialVenueName, initialVenueDbId, initialNowPlaying, initialQueue }: Props) {
  const [venueName] = useState(initialVenueName);
  const [venueDbId] = useState(initialVenueDbId);
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(initialNowPlaying);
  const [progress, setProgress] = useState(initialNowPlaying?.progress_ms ?? 0);
  const [selectedSong, setSelectedSong] = useState<SongDetail | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    const fetchQueue = async () => {
      const { data } = await supabase
        .from("queue")
        .select("id, song_id, added_by, tokens_spent, priority, position, added_at, songs(title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueDbId)
        .eq("status", "queued")
        .order("priority", { ascending: false })
        .order("position", { ascending: true })
        .limit(10);
      if (!cancelled && data) setQueue(data as unknown as QueueItem[]);
    };

    const fetchNowPlaying = async () => {
      const { data } = await supabase
        .from("now_playing")
        .select("song_id, progress_ms, is_playing, started_at, songs(title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueDbId)
        .single();
      if (!cancelled && data) {
        setNowPlaying(data as unknown as NowPlaying);
        setProgress(data.progress_ms ?? 0);
      }
    };

    const queueChannel = supabase
      .channel(`queue:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueDbId}` }, fetchQueue)
      .subscribe();

    const npChannel = supabase
      .channel(`now_playing:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` }, fetchNowPlaying)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(queueChannel);
      supabase.removeChannel(npChannel);
    };
  }, [venueDbId, supabase]);

  useEffect(() => {
    if (!nowPlaying?.is_playing) return;
    const dur = nowPlaying.songs?.duration_ms ?? 0;
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 1000, dur));
    }, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying]);

  const dur = nowPlaying?.songs?.duration_ms ?? 1;
  const progressPct = Math.min((progress / dur) * 100, 100);

  const getWaitMinutes = (idx: number) => {
    const base = nowPlaying?.songs ? Math.ceil((dur - progress) / 60000) : 0;
    return base + idx * 4;
  };

  return (
    <div className="min-h-screen bg-[#0f0a18]">
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <h1 className="text-white font-bold text-lg">{venueName || venueId}</h1>
      </div>

      <div className="mx-5 mb-4 rounded-2xl overflow-hidden" style={{ background: "#1a0e2a" }}>
        <div className="flex">
          <div className="flex-1 flex items-center gap-3 px-4 py-3 border-r border-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#9ca3af" strokeWidth="1.5" />
              <path d="M12 7v5l3 3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-[#6b7280] text-[10px]">Normal Bekleme</p>
              <p className="text-white font-bold text-sm">~{Math.max(getWaitMinutes(queue.length), 5)} dk</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-3 px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" />
            </svg>
            <div>
              <p className="text-[#6b7280] text-[10px]">Öncelikli Bekleme</p>
              <p className="font-bold text-sm" style={{ color: "#e91e8c" }}>~3 dk</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-5 rounded-3xl p-5 mb-5" style={{ background: "linear-gradient(145deg, #2d1045 0%, #1a0e2a 100%)", border: "1px solid rgba(233,30,140,0.15)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {nowPlaying?.is_playing && (
              <div className="flex gap-0.5 items-end h-4">
                {[3, 5, 4, 6, 3].map((h, i) => (
                  <div key={i} className="w-1 rounded-full" style={{ height: `${h * 3}px`, background: "#e91e8c", animation: `eq-bar ${0.5 + i * 0.12}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            )}
            <span className="text-white font-bold text-sm">Şu An Çalıyor</span>
          </div>
          {nowPlaying?.is_playing && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(233,30,140,0.2)", color: "#e91e8c" }}>CANLI</span>
          )}
        </div>

        <div className="flex flex-col items-center">
          <div className="relative mb-4">
            <div
              className="w-40 h-40 rounded-full"
              style={{
                background: "radial-gradient(circle at 50% 50%, #3d1a5e 0%, #1a0e2a 40%, #0a0612 70%)",
                boxShadow: "0 0 40px rgba(233,30,140,0.3)",
                animation: nowPlaying?.is_playing ? "spin 8s linear infinite" : "none",
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {nowPlaying?.songs?.album_cover_url ? (
                  <Image src={nowPlaying.songs.album_cover_url} alt="" width={64} height={64} className="w-16 h-16 rounded-full object-cover" style={{ boxShadow: "0 0 0 3px rgba(255,255,255,0.1)" }} />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="1.8" /></svg>
                  </div>
                )}
              </div>
            </div>
          </div>

          <h2 className="text-white font-bold text-xl text-center">{nowPlaying?.songs?.title ?? "Şu an çalan yok"}</h2>
          <p className="text-[#9ca3af] text-sm mb-4">{nowPlaying?.songs?.artist ?? ""}</p>

          <div className="w-full">
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #e91e8c, #8b5cf6)" }} />
            </div>
            <div className="flex justify-between">
              <span className="text-[#6b7280] text-xs">{formatTime(progress)}</span>
              <span className="text-[#6b7280] text-xs">{formatTime(dur === 1 ? 0 : dur)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white font-bold text-base">Sıradaki Şarkılar</h3>
          <span className="text-[#9ca3af] text-xs">Kuyrukta {queue.length} şarkı</span>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-12 text-[#6b7280] text-sm">Kuyruk boş — ilk şarkıyı sen ekle!</div>
        ) : (
          <div className="space-y-2 pb-36">
            {queue.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#1a0e2a" }}>
                <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden bg-[#0f0a18]">
                  {item.songs.album_cover_url && (
                    <Image src={item.songs.album_cover_url} alt={item.songs.title} width={48} height={48} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{item.songs.title}</p>
                  <p className="text-[#6b7280] text-xs truncate">{item.songs.artist}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.priority && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>Önce</span>
                  )}
                  <span className="text-xs font-bold" style={{ color: item.priority ? "#e91e8c" : "#9ca3af" }}>~{getWaitMinutes(idx)} dk</span>
                  <button
                    onClick={() =>
                      setSelectedSong({
                        id: item.id,
                        title: item.songs.title,
                        artist: item.songs.artist,
                        album_cover_url: item.songs.album_cover_url,
                        priority: item.priority,
                        tokens_spent: item.tokens_spent,
                        added_by: item.added_by,
                        wait_minutes: getWaitMinutes(idx),
                      })
                    }
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#9ca3af" strokeWidth="1.5" />
                      <path d="M12 8v4m0 4h.01" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 px-5 z-40">
        <Link href={`/venue/${venueId}/browse`} className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-95" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 0 20px rgba(59,130,246,0.35)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" /><path d="M12 8v8M8 12h8" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
          Şarkı Ekle
        </Link>
      </div>

      <SongDetailModal song={selectedSong} onClose={() => setSelectedSong(null)} />

      <style jsx>{`
        @keyframes eq-bar { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
