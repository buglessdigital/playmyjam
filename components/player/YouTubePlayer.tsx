"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// YouTube IFrame API'nin kullandığımız alt kümesi (resmi @types paketi olmadan)
type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
};

type YTStateChangeEvent = { data: number };
type YTErrorEvent = { data: number };

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        config: {
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: YTStateChangeEvent) => void;
            onError?: (e: YTErrorEvent) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; CUED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const HEARTBEAT_MS = 15_000;

type NowPlayingRow = {
  video_id: string | null;
  song_id: string | null;
  is_playing: boolean;
};

type NextResponse = {
  started: boolean;
  video_id?: string;
  queueEmpty?: boolean;
  error?: string;
};

let apiPromise: Promise<void> | null = null;

// IFrame API script'i tek sefer yüklenir; YT hazır olunca resolve eder
function loadIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise<void>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

interface Props {
  venueDbId: string;
  // Şu an çalan şarkının başlık bilgisi ekranda video DIŞINDA gösterilir (overlay yasak)
  onTrackChange?: (info: { videoId: string | null; isPlaying: boolean }) => void;
}

export default function YouTubePlayer({ venueDbId, onTrackChange }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoRef = useRef<string | null>(null);
  const advancingRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [idle, setIdle] = useState(false); // kuyruk boş, çalan yok
  const [error, setError] = useState("");

  const api = useCallback(
    async (payload: Record<string, unknown>): Promise<NextResponse | null> => {
      try {
        const res = await fetch(`/api/player/${venueDbId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return res.ok ? res.json() : null;
      } catch {
        return null;
      }
    },
    [venueDbId]
  );

  // İlerleme + sağlık sinyali — admin paneli bununla "oynatıcı çevrimdışı" uyarısı verir
  const sendHeartbeat = useCallback(() => {
    const player = playerRef.current;
    if (!player || !currentVideoRef.current) return;
    let progress = 0;
    let playing = false;
    try {
      progress = Math.floor(player.getCurrentTime() * 1000);
      const state = (player as unknown as { getPlayerState?: () => number }).getPlayerState?.();
      playing = state === window.YT?.PlayerState.PLAYING;
    } catch {
      return;
    }
    api({ action: "heartbeat", progress_ms: progress, is_playing: playing });
  }, [api]);

  const loadVideo = useCallback(
    (videoId: string) => {
      currentVideoRef.current = videoId;
      setIdle(false);
      playerRef.current?.loadVideoById(videoId);
      onTrackChange?.({ videoId, isPlaying: true });
    },
    [onTrackChange]
  );

  // Şarkı bitti / hata verdi → kuyruğu ilerlet, dönen videoyu yükle
  const advance = useCallback(
    async (payload: Record<string, unknown>) => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      try {
        const result = await api(payload);
        if (result?.started && result.video_id) {
          loadVideo(result.video_id);
        } else {
          currentVideoRef.current = null;
          setIdle(true);
          onTrackChange?.({ videoId: null, isPlaying: false });
        }
      } finally {
        advancingRef.current = false;
      }
    },
    [api, loadVideo, onTrackChange]
  );

  // "Başlat" — tarayıcı autoplay politikası gereği ilk oynatma kullanıcı dokunuşuyla
  const start = useCallback(async () => {
    setError("");
    await loadIframeApi();
    if (!containerRef.current || !window.YT) {
      setError("YouTube player yüklenemedi — sayfayı yenileyin");
      return;
    }

    const el = document.createElement("div");
    containerRef.current.replaceChildren(el);

    playerRef.current = new window.YT.Player(el, {
      playerVars: { playsinline: 1, rel: 0, autoplay: 0 },
      events: {
        onReady: async () => {
          // Kaldığı yerden devam: now_playing'de video varsa onu, yoksa sıradakini çal
          const { data } = await supabase
            .from("now_playing")
            .select("video_id, song_id, is_playing")
            .eq("venue_id", venueDbId)
            .maybeSingle();
          const np = data as NowPlayingRow | null;
          if (np?.video_id) {
            loadVideo(np.video_id);
          } else {
            advance({ action: "next" });
          }
        },
        onStateChange: (e) => {
          const YT = window.YT!;
          if (e.data === YT.PlayerState.ENDED) {
            advance({ action: "next" });
          } else if (e.data === YT.PlayerState.PLAYING) {
            onTrackChange?.({ videoId: currentVideoRef.current, isPlaying: true });
            sendHeartbeat();
          } else if (e.data === YT.PlayerState.PAUSED) {
            onTrackChange?.({ videoId: currentVideoRef.current, isPlaying: false });
            sendHeartbeat();
          } else if (e.data === YT.PlayerState.CUED) {
            playerRef.current?.playVideo();
          }
        },
        onError: () => {
          // 100/101/150: video kaldırılmış ya da embed'e kapalı — işaretle ve atla
          const failed = currentVideoRef.current;
          if (failed) advance({ action: "error", video_id: failed });
          else advance({ action: "next" });
        },
      },
    });

    setStarted(true);
  }, [advance, loadVideo, sendHeartbeat, onTrackChange, supabase, venueDbId]);

  useEffect(() => {
    if (!started) return;
    const interval = setInterval(sendHeartbeat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [started, sendHeartbeat]);

  // Dış komutları dinle: admin panelden next/pause, müşteri isteğiyle başlayan çalma
  useEffect(() => {
    if (!started) return;

    const channel = supabase
      .channel(`player-np:${venueDbId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` },
        (payload: { new: NowPlayingRow }) => {
          const np = payload.new;
          if (np.video_id && np.video_id !== currentVideoRef.current) {
            loadVideo(np.video_id);
            return;
          }
          if (!np.video_id && currentVideoRef.current) {
            currentVideoRef.current = null;
            setIdle(true);
            playerRef.current?.pauseVideo();
            onTrackChange?.({ videoId: null, isPlaying: false });
            return;
          }
          // Aynı video, oynat/duraklat komutu
          if (np.video_id) {
            if (np.is_playing) playerRef.current?.playVideo();
            else playerRef.current?.pauseVideo();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [started, supabase, venueDbId, loadVideo, onTrackChange]);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full">
      {/* YouTube kuralı: video görünür kalmalı, üzerine hiçbir şey bindirilemez */}
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black [&_iframe]:h-full [&_iframe]:w-full">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#1a0e2a]">
          <button
            onClick={start}
            className="flex items-center gap-3 rounded-2xl px-8 py-4 text-lg font-bold text-white transition-transform active:scale-95"
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
            Başlat
          </button>
          <p className="px-6 text-center text-xs text-[#6b7280]">
            Tarayıcı politikası gereği ilk oynatma için bir kez dokunmanız gerekir
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      {started && idle && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#1a0e2a]">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
          <p className="text-sm text-[#9ca3af]">Kuyruk boş — şarkı eklenince otomatik başlar</p>
        </div>
      )}
    </div>
  );
}
