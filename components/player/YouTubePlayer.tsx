"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// YouTube IFrame API'nin kullandığımız alt kümesi (resmi @types paketi olmadan)
type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
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
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const HEARTBEAT_MS = 15_000;
const IDLE_RETRY_MS = 15_000;
// Yükleme sonrası bu süre içinde gelen "duraklat" yankıları yok sayılır — skip
// anında yarışan bayat heartbeat'ler yeni şarkıyı durduramasın
const PAUSE_ECHO_GRACE_MS = 8_000;
// loadVideoById sonrası oynatmanın gerçekten başladığı bu aralıklarla doğrulanır
const PLAY_WATCHDOG_DELAYS_MS = [2_500, 6_000];
const PLAY_NUDGE_MS = 3_000;

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
  // Çalması gereken ama (arka plan sekmesinde autoplay engeli vb.) başlayamayan
  // videoyu bekçinin ayırt edebilmesi için niyet ayrı tutulur
  const desiredPlayingRef = useRef(false);
  // Son loadVideo zamanı — pause yankısı grace penceresinin çapası
  const lastLoadAtRef = useRef(0);
  const nudgeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
      const state = player.getPlayerState();
      // BUFFERING da "çalıyor" sayılır — geçiş anındaki tamponlama sunucuya
      // "durdu" diye yazılıp yankıyla yeni şarkıyı durdurmasın
      playing =
        state === window.YT?.PlayerState.PLAYING || state === window.YT?.PlayerState.BUFFERING;
    } catch {
      return;
    }
    // video_id eşlik eder: sunucu yalnızca satırdaki video hâlâ buysa yazar —
    // skip ile yarışan bayat heartbeat yeni şarkının durumunu ezemez
    api({
      action: "heartbeat",
      progress_ms: progress,
      is_playing: playing,
      video_id: currentVideoRef.current,
    });
  }, [api]);

  // Niyet "çal" iken player'ın gerçekten çaldığını doğrula; başlamadıysa dürt.
  // Arka plan sekmesinde tarayıcının sessizce engellediği başlatmaları toparlar.
  const ensurePlaying = useCallback(() => {
    const player = playerRef.current;
    const YT = window.YT;
    if (!player || !YT || !desiredPlayingRef.current || !currentVideoRef.current) return;
    try {
      const state = player.getPlayerState();
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        player.playVideo();
      }
    } catch {}
  }, []);

  const scheduleNudges = useCallback(
    (delays: number[]) => {
      nudgeTimersRef.current.forEach(clearTimeout);
      nudgeTimersRef.current = delays.map((ms) => setTimeout(ensurePlaying, ms));
    },
    [ensurePlaying]
  );

  const loadVideo = useCallback(
    (videoId: string) => {
      currentVideoRef.current = videoId;
      desiredPlayingRef.current = true;
      lastLoadAtRef.current = Date.now();
      setIdle(false);
      playerRef.current?.loadVideoById(videoId);
      onTrackChange?.({ videoId, isPlaying: true });
      scheduleNudges(PLAY_WATCHDOG_DELAYS_MS);
    },
    [onTrackChange, scheduleNudges]
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
          desiredPlayingRef.current = false;
          setIdle(true);
          onTrackChange?.({ videoId: null, isPlaying: false });
        }
      } finally {
        advancingRef.current = false;
      }
    },
    [api, loadVideo, onTrackChange]
  );

  // Bekçi: çalması gereken video CUED/UNSTARTED'da takıldıysa (arka plan
  // sekmesinde autoplay engeli) oynatmayı tekrar dene — tek seferlik playVideo
  // denemesi engellenince şarkı sonsuza dek bekliyordu
  const nudgePlayback = useCallback(() => {
    const player = playerRef.current;
    const YT = window.YT;
    if (!player || !YT || !currentVideoRef.current || !desiredPlayingRef.current) return;
    try {
      const state = player.getPlayerState();
      if (state === YT.PlayerState.CUED || state === -1 /* UNSTARTED */) {
        player.playVideo();
      }
    } catch {
      // player henüz hazır değil — sonraki turda denenir
    }
  }, []);

  // Emniyet ağı: Realtime kanalı arka plan sekmesinde sessizce kopabilir ve
  // panelden gelen next/play komutları kaçar — now_playing ile mutabakat kur
  const reconcile = useCallback(async () => {
    if (advancingRef.current) return;
    const { data } = await supabase
      .from("now_playing")
      .select("video_id, song_id, is_playing")
      .eq("venue_id", venueDbId)
      .maybeSingle();
    const np = data as NowPlayingRow | null;
    if (!np || advancingRef.current) return;
    if (np.video_id && np.video_id !== currentVideoRef.current) {
      loadVideo(np.video_id);
      return;
    }
    if (np.video_id && np.is_playing) {
      desiredPlayingRef.current = true;
      nudgePlayback();
    }
  }, [supabase, venueDbId, loadVideo, nudgePlayback]);

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
            desiredPlayingRef.current = true;
            onTrackChange?.({ videoId: currentVideoRef.current, isPlaying: true });
            sendHeartbeat();
          } else if (e.data === YT.PlayerState.PAUSED) {
            // PAUSED, gerçekten başlamış bir videonun durdurulmasıdır (kullanıcı/panel
            // niyeti); engellenen autoplay CUED/UNSTARTED'da kalır, buraya düşmez
            desiredPlayingRef.current = false;
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

  // Bekçi: idle'da takılı kalma (kuyruk-boş yarışı, ağ hatası vb.) — periyodik
  // olarak sıradakini iste; sunucu tarafı dolum yaptığı için çalma kendi toparlanır
  useEffect(() => {
    if (!started || !idle) return;
    const interval = setInterval(() => advance({ action: "next" }), IDLE_RETRY_MS);
    return () => clearInterval(interval);
  }, [started, idle, advance]);

  // Takılan oynatmayı periyodik dürt; sekme öne gelir gelmez de tam mutabakat —
  // arka planda engellenen autoplay görünürlükte ilk denemede tutar
  useEffect(() => {
    if (!started) return;
    const nudgeInterval = setInterval(nudgePlayback, PLAY_NUDGE_MS);
    const reconcileInterval = setInterval(reconcile, HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(nudgeInterval);
      clearInterval(reconcileInterval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [started, nudgePlayback, reconcile]);

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
            desiredPlayingRef.current = false;
            setIdle(true);
            playerRef.current?.pauseVideo();
            onTrackChange?.({ videoId: null, isPlaying: false });
            return;
          }
          // Aynı video, oynat/duraklat komutu
          if (np.video_id) {
            if (np.is_playing) {
              desiredPlayingRef.current = true;
              playerRef.current?.playVideo();
              scheduleNudges([PLAY_NUDGE_MS]);
            } else {
              // "Durdu" gerçek bir duraklatma komutu mu, yoksa takılı player'ın
              // kendi heartbeat'inin yankısı mı? Hiç başlamamış (CUED/UNSTARTED)
              // videoda ve yüklemeden hemen sonra niyet söndürülmez — söndürülürse
              // bekçi devre dışı kalır ve şarkı sonsuza dek bekler
              let neverStarted = false;
              try {
                const s = playerRef.current?.getPlayerState();
                neverStarted = s === window.YT?.PlayerState.CUED || s === -1;
              } catch {}
              if (!neverStarted && Date.now() - lastLoadAtRef.current > PAUSE_ECHO_GRACE_MS) {
                desiredPlayingRef.current = false;
                playerRef.current?.pauseVideo();
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [started, supabase, venueDbId, loadVideo, onTrackChange, scheduleNudges]);

  useEffect(() => {
    return () => {
      nudgeTimersRef.current.forEach(clearTimeout);
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
          <p className="text-sm text-[#9ca3af]">Kuyruk boş — sıradaki şarkı otomatik denenecek</p>
        </div>
      )}
    </div>
  );
}
