"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// YouTube IFrame API'nin kullandığımız alt kümesi (resmi @types paketi olmadan)
type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  getVolume?: () => number;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
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

// Panelin ilerleme çubuğu bu sinyalin taşıdığı çapaya (started_at) yaslanır:
// aralık uzadıkça panel player'dan sapar, o yüzden 5 sn.
const HEARTBEAT_MS = 5_000;
// Durum denetimleri (dürtme/uzlaştırma) daha seyrek — okuma maliyeti taşırlar
const RECONCILE_MS = 15_000;
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
  progress_ms?: number | null;
  volume?: number | null;
};

// 0036 uygulanmadan kod deploy edilirse volume kolonu yoktur ve select komple
// düşerdi — ilk hatada anlaşılıp kolonsuz sürüme dönülür (bkz. route.ts'teki
// claimSupported ile aynı yaklaşım)
const NP_SELECT = "video_id, song_id, is_playing, volume";
const NP_SELECT_LEGACY = "video_id, song_id, is_playing";
let volumeColumnMissing = false;

async function readNowPlaying(
  supabase: ReturnType<typeof createClient>,
  venueDbId: string
): Promise<NowPlayingRow | null> {
  const run = () =>
    supabase
      .from("now_playing")
      .select(volumeColumnMissing ? NP_SELECT_LEGACY : NP_SELECT)
      .eq("venue_id", venueDbId)
      .maybeSingle();

  const first = await run();
  if (first.error && !volumeColumnMissing) {
    console.error("[player] now_playing okunamadı, volume kolonsuz denenecek:", first.error.message);
    volumeColumnMissing = true;
    const retry = await run();
    return (retry.data as NowPlayingRow | null) ?? null;
  }
  return (first.data as NowPlayingRow | null) ?? null;
}

type PlayerApiResult = {
  started?: boolean;
  video_id?: string;
  queueEmpty?: boolean;
  error?: string;
  ok?: boolean;
  taken?: boolean;
  claimed?: boolean;
};

// Çalmayı durduran engeller: oturum düştü (401) veya sahiplik başka cihaza geçti (409).
// İkisi de "kuyruk boş" DEĞİLDİR — ekranda ayrı ayrı, doğru mesajla gösterilir.
type Blocked = "auth" | "claim";

let apiPromise: Promise<void> | null = null;

// Sekme kimliği: sahiplik bunun üzerinden yürür. sessionStorage sekmeye özeldir
// ve yenilemede korunur — sayfa yenilenince kendi kilidimize takılmayız, ama
// ikinci bir sekme/cihaz her zaman farklı kimlik alır.
function playerInstanceId(venueDbId: string): string {
  const key = `pmj-player-claim:${venueDbId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

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
  // Oturum düşerse buraya yönlendiren "Tekrar giriş yap" bağlantısı gösterilir
  loginHref?: string;
  // Şu an çalan şarkının başlık bilgisi ekranda video DIŞINDA gösterilir (overlay yasak)
  onTrackChange?: (info: { videoId: string | null; isPlaying: boolean }) => void;
}

export default function YouTubePlayer({ venueDbId, loginHref, onTrackChange }: Props) {
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
  // new YT.Player() nesnesi ANINDA döner ama metotları (loadVideoById vb.) ancak
  // iframe yüklenip onReady tetiklenince eklenir. Arada gelen realtime komutu
  // "loadVideoById is not a function" ile patlıyordu — hazır olana dek beklet.
  const readyRef = useRef(false);
  const pendingVideoRef = useRef<string | null>(null);

  const [started, setStarted] = useState(false);
  const [idle, setIdle] = useState(false); // kuyruk boş, çalan yok
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [claimTaken, setClaimTaken] = useState(false);
  // Render beklemeden okunabilsin diye ayna: advance/idle mantığı buna bakar
  const blockedRef = useRef<Blocked | null>(null);
  // İlk istekte üretilir: sunucuda çalışmaz, render'ı da etkilemez
  const claimIdRef = useRef<string | null>(null);
  const claimId = useCallback(() => {
    claimIdRef.current ??= playerInstanceId(venueDbId);
    return claimIdRef.current;
  }, [venueDbId]);

  // Panelden gelen ses seviyesi. Player hazır olmadan komut gelirse burada
  // bekler, onReady bunu uygular.
  const volumeRef = useRef<number | null>(null);
  // Cihaz ses komutunu yok sayıyor mu? (mobilde YT.setVolume etkisizdir)
  const [volumeIgnored, setVolumeIgnored] = useState(false);
  const volumeDriftRef = useRef(0);

  // İstenen seviyeyi player'a bas. Tek seferlik DEĞİL: YouTube yeni video
  // yüklenince kendi hatırladığı seviyeye dönebiliyor, bu yüzden aşağıdaki
  // bekçi bunu gerektikçe tekrar çağırır.
  const pushVolume = useCallback(() => {
    const volume = volumeRef.current;
    const player = playerRef.current;
    if (volume === null || !readyRef.current || typeof player?.setVolume !== "function") return;
    try {
      player.setVolume(volume);
      // setVolume(0) bazı cihazlarda yok sayılıyor; sessize alma ayrıca mute ile
      // pekiştirilir. Tersi de geçerli: mute açık kalırsa >0 seviye duyulmaz.
      if (volume === 0) player.mute?.();
      else if (player.isMuted?.()) player.unMute?.();
    } catch {}
  }, []);

  const applyVolume = useCallback(
    (value: number | null | undefined) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      volumeRef.current = Math.min(100, Math.max(0, Math.round(value)));
      volumeDriftRef.current = 0;
      setVolumeIgnored(false);
      pushVolume();
    },
    [pushVolume]
  );

  // Bekçi: player'ın gerçek sesini okuyup istenenden saptıysa geri yazar.
  // "Ses kısılıyor ama kendiliğinden geri açılıyor" şikâyetinin kaynağı buydu —
  // video değişiminde YouTube kendi seviyesine dönüyor, kimse geri yazmıyordu.
  const enforceVolume = useCallback(() => {
    const volume = volumeRef.current;
    const player = playerRef.current;
    if (volume === null || !readyRef.current || !player) return;
    let actual: number | null = null;
    let muted = false;
    try {
      actual = typeof player.getVolume === "function" ? Math.round(player.getVolume()) : null;
      muted = player.isMuted?.() ?? false;
    } catch {
      return;
    }
    // Sapma OLMASA BİLE her turda yeniden yazılır. getVolume() bazı cihazlarda
    // yalan söylüyor: JS'e en son verilen değeri döndürürken hoparlörden çıkan
    // ses YouTube'un kendi hatırladığı seviyeye dönmüş oluyor ("bar 5'te kalıyor
    // ama ses yükseliyor"). Okumaya güvenip beklemek yerine körlemesine basıyoruz;
    // setVolume idempotent, aynı değeri tekrar yazmanın maliyeti yok.
    pushVolume();

    const drifted = (actual !== null && actual !== volume) || (volume === 0 ? !muted : muted);
    if (!drifted) {
      volumeDriftRef.current = 0;
      setVolumeIgnored(false);
      return;
    }
    // Üst üste sapma: cihaz komutu kabul etmiyor demektir (mobil tarayıcılarda
    // ses donanımdan yönetilir). Ekranda söyleyelim ki mekan boşuna uğraşmasın.
    volumeDriftRef.current += 1;
    if (volumeDriftRef.current >= 3) setVolumeIgnored(true);
  }, [pushVolume]);

  const setBlock = useCallback((next: Blocked | null) => {
    if (blockedRef.current === next) return;
    blockedRef.current = next;
    setBlocked(next);
  }, []);

  const api = useCallback(
    async (payload: Record<string, unknown>): Promise<PlayerApiResult | null> => {
      try {
        const res = await fetch(`/api/player/${venueDbId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, claim_id: claimId() }),
        });
        // 401: mekan oturumu düştü. 409: çalma başka bir cihaza geçti.
        if (res.status === 401) {
          setBlock("auth");
          return null;
        }
        if (res.status === 409) {
          setBlock("claim");
          return null;
        }
        if (!res.ok) return null;
        setBlock(null);
        return res.json();
      } catch {
        return null;
      }
    },
    [venueDbId, claimId, setBlock]
  );

  // İlerleme + sağlık sinyali — admin paneli bununla "oynatıcı çevrimdışı" uyarısı verir
  const sendHeartbeat = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    // Kuyruk boşken de sinyal gider: müşteri tarafı "oynatıcı açık mı" sorusunu
    // heartbeat tazeliğinden okuyor; sessiz kalırsak boş mekanda şarkı eklenemez.
    // presence:true çalma durumunu yazmaz, yalnızca sağlık sinyalini tazeler.
    if (!currentVideoRef.current) {
      api({ action: "heartbeat", presence: true });
      return;
    }
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
      // Ses de aynı turda doğrulanır: yeni video YouTube'un kendi seviyesiyle
      // açılırsa mekanın ayarı birkaç saniye içinde geri basılır
      nudgeTimersRef.current = delays.map((ms) =>
        setTimeout(() => {
          ensurePlaying();
          enforceVolume();
        }, ms)
      );
    },
    [ensurePlaying, enforceVolume]
  );

  const loadVideo = useCallback(
    (videoId: string) => {
      currentVideoRef.current = videoId;
      desiredPlayingRef.current = true;
      lastLoadAtRef.current = Date.now();
      setIdle(false);
      const player = playerRef.current;
      if (readyRef.current && typeof player?.loadVideoById === "function") {
        pendingVideoRef.current = null;
        player.loadVideoById(videoId);
        scheduleNudges(PLAY_WATCHDOG_DELAYS_MS);
      } else {
        // Player henüz hazır değil — onReady bu videoyu yükleyecek
        pendingVideoRef.current = videoId;
      }
      onTrackChange?.({ videoId, isPlaying: true });
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
        } else if (!blockedRef.current) {
          // Yalnızca gerçekten sıradaki yoksa idle'a düş. Oturum düşmesi ya da
          // sahiplik kaybı "kuyruk boş" değildir; kendi ekranını gösterir.
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
    const np = await readNowPlaying(supabase, venueDbId);
    if (!np || advancingRef.current) return;
    // Realtime kopmuşken değişen ses seviyesi de burada yakalanır
    if (np.volume !== volumeRef.current) applyVolume(np.volume);
    if (np.video_id && np.video_id !== currentVideoRef.current) {
      loadVideo(np.video_id);
      return;
    }
    if (np.video_id && np.is_playing) {
      desiredPlayingRef.current = true;
      nudgePlayback();
    }
  }, [supabase, venueDbId, loadVideo, nudgePlayback, applyVolume]);

  // "Başlat" — tarayıcı autoplay politikası gereği ilk oynatma kullanıcı dokunuşuyla.
  // Önce sahiplik alınır: aynı mekanda ikinci bir sekme/cihaz açıksa çift ses olmasın.
  const start = useCallback(async (force = false) => {
    setError("");

    const claim = await api({ action: "claim", force });
    if (blockedRef.current === "auth") return;
    if (claim?.taken) {
      setClaimTaken(true);
      return;
    }
    setClaimTaken(false);

    await loadIframeApi();
    if (!containerRef.current || !window.YT) {
      setError("YouTube player yüklenemedi — sayfayı yenileyin");
      return;
    }

    const el = document.createElement("div");
    containerRef.current.replaceChildren(el);

    readyRef.current = false;
    pendingVideoRef.current = null;

    playerRef.current = new window.YT.Player(el, {
      playerVars: { playsinline: 1, rel: 0, autoplay: 0 },
      events: {
        onReady: async () => {
          readyRef.current = true;
          // Player hazır olmadan gelen ses komutu biriktiyse şimdi uygula
          pushVolume();
          // Hazır olmadan gelen komut biriktiyse önce onu çal
          const pending = pendingVideoRef.current;
          if (pending) {
            loadVideo(pending);
            return;
          }
          // Kaldığı yerden devam: now_playing'de video varsa onu, yoksa sıradakini çal
          const np = await readNowPlaying(supabase, venueDbId);
          // Mekanın en son ayarladığı ses seviyesiyle aç — yeniden başlatmada sıfırlanmaz
          applyVolume(np?.volume);
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
            // Yeni video/aygıt değişiminde player varsayılan sese dönebilir
            pushVolume();
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
  }, [api, advance, loadVideo, sendHeartbeat, onTrackChange, supabase, venueDbId, applyVolume, pushVolume]);

  // Sahiplik başka cihaza geçtiyse bu sekme derhal susar — çift ses olmasın
  useEffect(() => {
    if (blocked !== "claim") return;
    desiredPlayingRef.current = false;
    try {
      playerRef.current?.pauseVideo();
    } catch {}
  }, [blocked]);

  // Oturum düştüyse heartbeat yollamaya devam et: yeniden giriş yapılınca
  // (ör. başka sekmede) ilk başarılı istek engeli kaldırır ve çalma sürer.
  useEffect(() => {
    if (!started || blocked === "claim") return;
    // İlk sinyal beklemeden gitsin: müşteri tarafı player açılır açılmaz "açık" görsün
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [started, blocked, sendHeartbeat]);

  // Bekçi: idle'da takılı kalma (kuyruk-boş yarışı, ağ hatası vb.) — periyodik
  // olarak sıradakini iste; sunucu tarafı dolum yaptığı için çalma kendi toparlanır
  useEffect(() => {
    if (!started || !idle || blocked) return;
    const interval = setInterval(() => advance({ action: "next" }), IDLE_RETRY_MS);
    return () => clearInterval(interval);
  }, [started, idle, blocked, advance]);

  // Takılan oynatmayı periyodik dürt; sekme öne gelir gelmez de tam mutabakat —
  // arka planda engellenen autoplay görünürlükte ilk denemede tutar
  useEffect(() => {
    if (!started || blocked) return;
    const nudgeInterval = setInterval(() => {
      nudgePlayback();
      enforceVolume();
    }, PLAY_NUDGE_MS);
    const reconcileInterval = setInterval(reconcile, RECONCILE_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(nudgeInterval);
      clearInterval(reconcileInterval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [started, blocked, nudgePlayback, reconcile, enforceVolume]);

  // Dış komutları dinle: admin panelden next/pause, müşteri isteğiyle başlayan çalma
  useEffect(() => {
    if (!started || blocked === "claim") return;

    const channel = supabase
      .channel(`player-np:${venueDbId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` },
        (payload: { new: NowPlayingRow }) => {
          // Sahiplik kaybedildiyse dinlemeye devam etme — sesi açan taraf sahip
          if (blockedRef.current === "claim") return;
          const np = payload.new;
          // Ses seviyesi her daldan önce uygulanır: şarkı değişimiyle aynı
          // güncellemede gelse bile (aşağıdaki dallar return ediyor) kaçmasın.
          // Heartbeat yankılarında değer değişmediği için setVolume çağrılmaz.
          if (np.volume !== volumeRef.current) applyVolume(np.volume);
          // Panelden "baştan başlat": aynı video, ilerleme sıfırlanmış. Şarkının
          // ilk saniyelerinde gelen heartbeat yankısı da sıfır taşır; o yüzden
          // yalnızca gerçekten ilerlemiş bir videoda başa sarılır.
          if (
            np.video_id &&
            np.video_id === currentVideoRef.current &&
            (np.progress_ms ?? -1) === 0
          ) {
            let elapsed = 0;
            try {
              elapsed = (playerRef.current?.getCurrentTime() ?? 0) * 1000;
            } catch {}
            if (elapsed > 2_000) {
              try {
                playerRef.current?.seekTo(0, true);
                if (np.is_playing) playerRef.current?.playVideo();
              } catch {}
              return;
            }
          }
          if (np.video_id && np.video_id !== currentVideoRef.current) {
            loadVideo(np.video_id);
            return;
          }
          if (!np.video_id && currentVideoRef.current) {
            currentVideoRef.current = null;
            desiredPlayingRef.current = false;
            setIdle(true);
            pendingVideoRef.current = null;
            try {
              playerRef.current?.pauseVideo();
            } catch {}
            onTrackChange?.({ videoId: null, isPlaying: false });
            return;
          }
          // Aynı video, oynat/duraklat komutu
          if (np.video_id) {
            if (np.is_playing) {
              desiredPlayingRef.current = true;
              try {
                playerRef.current?.playVideo();
              } catch {}
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
                try {
                  playerRef.current?.pauseVideo();
                } catch {}
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [started, blocked, supabase, venueDbId, loadVideo, onTrackChange, scheduleNudges, applyVolume]);

  // "Çalmayı buraya al": sahipliği zorla devral ve kaldığı yerden sürdür
  const takeOver = useCallback(async () => {
    const result = await api({ action: "claim", force: true });
    if (!result?.claimed) return;
    setClaimTaken(false);
    setBlock(null);
    reconcile();
  }, [api, setBlock, reconcile]);

  useEffect(() => {
    return () => {
      nudgeTimersRef.current.forEach(clearTimeout);
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
      readyRef.current = false;
    };
  }, []);

  return (
    <div className="relative w-full">
      {/* YouTube kuralı: video görünür kalmalı, üzerine hiçbir şey bindirilemez */}
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black [&_iframe]:h-full [&_iframe]:w-full">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Cihaz ses komutunu kabul etmiyorsa (mobil tarayıcılarda ses donanımdan
          yönetilir) mekan bunu ekranda görsün — panelde boşuna uğraşmasın */}
      {volumeIgnored && (
        <p className="mt-2 text-center text-xs text-[#fbbf24]">
          Bu cihaz uzaktan ses ayarını kabul etmiyor — sesi cihazın kendi düğmelerinden
          ayarlayın. Uzaktan kontrol için player&apos;ı bilgisayarda açın.
        </p>
      )}

      {/* Oturum düştü — eskiden bu durumda "kuyruk boş" yazıyor, mekan nedenini anlayamıyordu */}
      {blocked === "auth" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#1a0e2a] px-6 text-center">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <p className="text-sm font-bold text-white">Mekan oturumu düştü — müzik durdu</p>
          <p className="text-xs text-[#9ca3af]">
            Tekrar giriş yapıldığı anda çalma kaldığı yerden devam eder.
          </p>
          {loginHref && (
            <a
              href={loginHref}
              className="mt-1 rounded-2xl px-6 py-3 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
            >
              Tekrar Giriş Yap
            </a>
          )}
        </div>
      ) : blocked === "claim" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#1a0e2a] px-6 text-center">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="14" rx="2" stroke="#9ca3af" strokeWidth="2" /><path d="M8 21h8" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
          <p className="text-sm font-bold text-white">Çalma başka bir cihaza geçti</p>
          <p className="text-xs text-[#9ca3af]">
            Çift ses olmasın diye bu ekran susturuldu. Müzik diğer cihazdan çalıyor.
          </p>
          <button
            onClick={takeOver}
            className="mt-1 rounded-2xl px-6 py-3 text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            Çalmayı Buraya Al
          </button>
        </div>
      ) : claimTaken ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#1a0e2a] px-6 text-center">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="14" rx="2" stroke="#9ca3af" strokeWidth="2" /><path d="M8 21h8" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
          <p className="text-sm font-bold text-white">Player başka bir cihazda/sekmede açık</p>
          <p className="text-xs text-[#9ca3af]">
            Buradan da başlatırsan iki ses üst üste biner. Müzik zaten diğer ekrandan çalıyor.
          </p>
          <button
            onClick={() => start(true)}
            className="mt-1 rounded-2xl px-6 py-3 text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            Yine de Buradan Çal
          </button>
        </div>
      ) : !started ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#1a0e2a]">
          <button
            onClick={() => start()}
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
      ) : idle ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#1a0e2a]">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
          <p className="text-sm text-[#9ca3af]">Kuyruk boş — sıradaki şarkı otomatik denenecek</p>
        </div>
      ) : null}
    </div>
  );
}
