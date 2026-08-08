"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CMD_EVENT,
  STATE_EVENT,
  playerBusChannel,
  type PlayerCommand,
  type PlayerStateBeat,
} from "@/lib/player-bus";

// YouTube IFrame API'nin kullandığımız alt kümesi (resmi @types paketi olmadan)
type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
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

// --- Crossfade ---
// Kalan süre kontrolü: 250 ms, panelin ilerleme çubuğuyla aynı çözünürlük
const CROSSFADE_TICK_MS = 250;
// Geçiş başlamadan bu kadar önce sıradaki video ikinci deck'e yüklenir
// (tamponlama + reklamsız başlangıç için pay)
const PRELOAD_LEAD_SEC = 12;
// Ses rampasının adım aralığı: 60 ms'de bir setVolume — kulakta sürekli duyulur,
// iframe'e de aşırı çağrı gitmez
const FADE_STEP_MS = 60;
// Şarkı bu süreden kısaysa crossfade yapılmaz: geçiş şarkının hatırı sayılır
// bir kısmını yer ve iki kısa parça üst üste binince kakofoni olur
const MIN_SONG_FOR_FADE = (fadeSec: number) => fadeSec * 2 + 5;

type DeckKey = "a" | "b";
const otherDeck = (key: DeckKey): DeckKey => (key === "a" ? "b" : "a");

type NowPlayingRow = {
  video_id: string | null;
  song_id: string | null;
  is_playing: boolean;
  progress_ms?: number | null;
  volume?: number | null;
  crossfade_ms?: number | null;
};

// 0036/0039 uygulanmadan kod deploy edilirse volume/crossfade_ms kolonu yoktur ve
// select komple düşerdi — ilk hatada anlaşılıp bir alt sürüme dönülür (bkz.
// route.ts'teki claimSupported ile aynı yaklaşım)
const NP_SELECTS = [
  "video_id, song_id, is_playing, volume, crossfade_ms",
  "video_id, song_id, is_playing, volume",
  "video_id, song_id, is_playing",
];
let npSelectLevel = 0;

async function readNowPlaying(
  supabase: ReturnType<typeof createClient>,
  venueDbId: string
): Promise<NowPlayingRow | null> {
  while (npSelectLevel < NP_SELECTS.length) {
    const { data, error } = await supabase
      .from("now_playing")
      .select(NP_SELECTS[npSelectLevel])
      .eq("venue_id", venueDbId)
      .maybeSingle();
    if (!error) return (data as NowPlayingRow | null) ?? null;
    if (npSelectLevel === NP_SELECTS.length - 1) {
      console.error("[player] now_playing okunamadı:", error.message);
      return null;
    }
    console.error("[player] now_playing okunamadı, daha dar select denenecek:", error.message);
    npSelectLevel += 1;
  }
  return null;
}

type PlayerApiResult = {
  started?: boolean;
  video_id?: string | null;
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

// Mobil tarayıcılarda YT.setVolume etkisizdir (ses donanımdan yönetilir). Orada
// crossfade "iki şarkı 4 sn tam sesle üst üste" demek olurdu — hiç denemeyiz.
function deviceSupportsVolume(): boolean {
  if (typeof navigator === "undefined") return false;
  return !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
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

  // İki deck: crossfade sırasında çıkan ve giren şarkı aynı anda çalar. Aktif
  // olan her zaman "şu an çalan"dır; diğeri ya boştadır ya sıradakini tamponlar.
  const deckAHostRef = useRef<HTMLDivElement>(null);
  const deckBHostRef = useRef<HTMLDivElement>(null);
  const decksRef = useRef<Record<DeckKey, YTPlayer | null>>({ a: null, b: null });
  // new YT.Player() nesnesi ANINDA döner ama metotları (loadVideoById vb.) ancak
  // iframe yüklenip onReady tetiklenince eklenir. Arada gelen realtime komutu
  // "loadVideoById is not a function" ile patlıyordu — hazır olana dek beklet.
  const deckReadyRef = useRef<Record<DeckKey, boolean>>({ a: false, b: false });
  const activeDeckRef = useRef<DeckKey>("a");
  const [visibleDeck, setVisibleDeck] = useState<DeckKey>("a");

  const activePlayer = useCallback(() => decksRef.current[activeDeckRef.current], []);
  const activeReady = useCallback(() => deckReadyRef.current[activeDeckRef.current], []);
  const standbyPlayer = useCallback(() => decksRef.current[otherDeck(activeDeckRef.current)], []);

  const currentVideoRef = useRef<string | null>(null);
  const advancingRef = useRef(false);
  // Çalması gereken ama (arka plan sekmesinde autoplay engeli vb.) başlayamayan
  // videoyu bekçinin ayırt edebilmesi için niyet ayrı tutulur
  const desiredPlayingRef = useRef(false);
  // Son loadVideo zamanı — pause yankısı grace penceresinin çapası
  const lastLoadAtRef = useRef(0);
  const nudgeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
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
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Panelle arasındaki düşük gecikmeli hat (bkz. lib/player-bus.ts)
  const busRef = useRef<ReturnType<typeof playerBusChannel> | null>(null);
  const claimId = useCallback(() => {
    claimIdRef.current ??= playerInstanceId(venueDbId);
    return claimIdRef.current;
  }, [venueDbId]);

  // Panelden gelen ses seviyesi. Player hazır olmadan komut gelirse burada
  // bekler, onReady bunu uygular.
  const volumeRef = useRef<number | null>(null);
  // Cihaz ses komutunu yok sayıyor mu? (mobilde YT.setVolume etkisizdir)
  const [volumeIgnored, setVolumeIgnored] = useState(false);
  const volumeIgnoredRef = useRef(false);
  const volumeDriftRef = useRef(0);

  // Crossfade durumu. Süre panelden gelir (now_playing.crossfade_ms); 0 = kapalı.
  const crossfadeMsRef = useRef(0);
  const fadingRef = useRef(false);
  const [fading, setFading] = useState(false);
  // Görsel geçişin süresi. Ref yerine state: render sırasında ref okunamaz ve
  // süre geçiş başlarken sabitlenmeli — panel ortada değeri değiştirse bile
  // devam eden geçiş kendi süresiyle tamamlanır.
  const [fadeMs, setFadeMs] = useState(0);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Önyüklenen sıradaki video ve bunun hangi şarkı için yapıldığı
  const preloadedVideoRef = useRef<string | null>(null);
  const preloadedForRef = useRef<string | null>(null);
  const canCrossfadeRef = useRef(false);

  // İstenen seviyeyi AKTİF deck'e bas. Tek seferlik DEĞİL: YouTube yeni video
  // yüklenince kendi hatırladığı seviyeye dönebiliyor, bu yüzden aşağıdaki
  // bekçi bunu gerektikçe tekrar çağırır. Geçiş sırasında rampayı ezmemek için
  // devre dışıdır.
  const pushVolume = useCallback(() => {
    const volume = volumeRef.current;
    const player = activePlayer();
    if (volume === null || fadingRef.current || !activeReady()) return;
    if (typeof player?.setVolume !== "function") return;
    try {
      player.setVolume(volume);
      // setVolume(0) bazı cihazlarda yok sayılıyor; sessize alma ayrıca mute ile
      // pekiştirilir. Tersi de geçerli: mute açık kalırsa >0 seviye duyulmaz.
      if (volume === 0) player.mute?.();
      else if (player.isMuted?.()) player.unMute?.();
    } catch {}
  }, [activePlayer, activeReady]);

  const applyVolume = useCallback(
    (value: number | null | undefined) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      volumeRef.current = Math.min(100, Math.max(0, Math.round(value)));
      volumeDriftRef.current = 0;
      volumeIgnoredRef.current = false;
      setVolumeIgnored(false);
      pushVolume();
    },
    [pushVolume]
  );

  const applyCrossfade = useCallback((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    crossfadeMsRef.current = Math.min(12_000, Math.max(0, Math.round(value)));
  }, []);

  // Bekçi: player'ın gerçek sesini okuyup istenenden saptıysa geri yazar.
  // "Ses kısılıyor ama kendiliğinden geri açılıyor" şikâyetinin kaynağı buydu —
  // video değişiminde YouTube kendi seviyesine dönüyor, kimse geri yazmıyordu.
  const enforceVolume = useCallback(() => {
    const volume = volumeRef.current;
    const player = activePlayer();
    // Geçiş sırasında ses kasten rampada: bekçi burada susmazsa rampayı ezer
    if (volume === null || fadingRef.current || !activeReady() || !player) return;
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
      volumeIgnoredRef.current = false;
      setVolumeIgnored(false);
      return;
    }
    // Üst üste sapma: cihaz komutu kabul etmiyor demektir (mobil tarayıcılarda
    // ses donanımdan yönetilir). Ekranda söyleyelim ki mekan boşuna uğraşmasın.
    // Crossfade de bu noktada güvenilmez olur: rampa duyulmaz, iki şarkı tam
    // sesle üst üste biner — o yüzden kapatılır.
    volumeDriftRef.current += 1;
    if (volumeDriftRef.current >= 3) {
      volumeIgnoredRef.current = true;
      setVolumeIgnored(true);
    }
  }, [activePlayer, activeReady, pushVolume]);

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

  // Geçişi bitir/iptal et: rampayı durdur, boştaki deck'i sustur, aktif deck'i
  // mekanın seviyesine kilitle. Hem normal bitişte hem elle atlama/duraklatma
  // gibi araya giren komutlarda çağrılır.
  const endCrossfade = useCallback(() => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    const wasFading = fadingRef.current;
    fadingRef.current = false;
    const idleDeck = standbyPlayer();
    try {
      idleDeck?.setVolume(0);
      idleDeck?.pauseVideo();
    } catch {}
    if (wasFading) setFading(false);
    setVisibleDeck(activeDeckRef.current);
    pushVolume();
  }, [standbyPlayer, pushVolume]);

  // Panelin alt barına anlık durum: DB → Realtime turunu beklemeden gider, böylece
  // ilerleme çubuğu ve oynat/duraklat simgesi player'la aynı anda değişir.
  const broadcastState = useCallback((override?: Partial<PlayerStateBeat>) => {
    const channel = busRef.current;
    if (!channel) return;
    const player = activePlayer();
    let progress = 0;
    let duration: number | null = null;
    let playing = false;
    if (player && currentVideoRef.current) {
      try {
        progress = Math.floor(player.getCurrentTime() * 1000);
        const secs = player.getDuration();
        duration = Number.isFinite(secs) && secs > 0 ? Math.floor(secs * 1000) : null;
        const state = player.getPlayerState();
        playing =
          state === window.YT?.PlayerState.PLAYING || state === window.YT?.PlayerState.BUFFERING;
      } catch {}
    }
    const beat: PlayerStateBeat = {
      video_id: currentVideoRef.current,
      is_playing: playing,
      progress_ms: Math.max(progress, 0),
      duration_ms: duration,
      at: Date.now(),
      // Yeni video yüklenirken getCurrentTime bir süre ESKİ şarkıyı raporlar;
      // çağıran taraf doğru değeri biliyorsa üstüne yazar
      ...override,
    };
    try {
      channel.send({ type: "broadcast", event: STATE_EVENT, payload: beat });
    } catch {}
  }, [activePlayer]);

  // İlerleme + sağlık sinyali — admin paneli bununla "oynatıcı çevrimdışı" uyarısı verir
  const sendHeartbeat = useCallback(() => {
    const player = activePlayer();
    if (!player) return;
    // Aynı bilgi panele hızlı hattan da gider: DB yolu kalıcılık için, bu tazelik için
    broadcastState();
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
  }, [api, activePlayer, broadcastState]);

  // Niyet "çal" iken player'ın gerçekten çaldığını doğrula; başlamadıysa dürt.
  // Arka plan sekmesinde tarayıcının sessizce engellediği başlatmaları toparlar.
  const ensurePlaying = useCallback(() => {
    const player = activePlayer();
    const YT = window.YT;
    if (!player || !YT || !desiredPlayingRef.current || !currentVideoRef.current) return;
    try {
      const state = player.getPlayerState();
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        player.playVideo();
      }
    } catch {}
  }, [activePlayer]);

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

  // Sert geçiş: videoyu AKTİF deck'e yükler. Elle atlama, panel komutu, hata
  // sonrası atlama hep buradan geçer — crossfade yalnızca şarkı doğal biterken
  // devreye girer, çünkü tuşa basan biri beklemek istemez.
  const loadVideo = useCallback(
    (videoId: string) => {
      // Araya giren komut: yarım kalmış geçiş derhal biter, boştaki deck susar
      endCrossfade();
      preloadedVideoRef.current = null;
      preloadedForRef.current = null;

      currentVideoRef.current = videoId;
      desiredPlayingRef.current = true;
      lastLoadAtRef.current = Date.now();
      setIdle(false);
      const player = activePlayer();
      if (activeReady() && typeof player?.loadVideoById === "function") {
        pendingVideoRef.current = null;
        player.loadVideoById(videoId);
        scheduleNudges(PLAY_WATCHDOG_DELAYS_MS);
      } else {
        // Player henüz hazır değil — onReady bu videoyu yükleyecek
        pendingVideoRef.current = videoId;
      }
      onTrackChange?.({ videoId, isPlaying: true });
      // Panel yeni şarkıyı DB turunu beklemeden görsün; süre henüz bilinmiyor
      broadcastState({ video_id: videoId, is_playing: true, progress_ms: 0, duration_ms: null });
    },
    [onTrackChange, scheduleNudges, endCrossfade, activePlayer, activeReady, broadcastState]
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
          endCrossfade();
          currentVideoRef.current = null;
          desiredPlayingRef.current = false;
          preloadedVideoRef.current = null;
          preloadedForRef.current = null;
          setIdle(true);
          onTrackChange?.({ videoId: null, isPlaying: false });
          broadcastState({ video_id: null, is_playing: false, progress_ms: 0 });
        }
      } finally {
        advancingRef.current = false;
      }
    },
    [api, loadVideo, onTrackChange, endCrossfade, broadcastState]
  );

  // Sıradaki videoyu boştaki deck'e tampona al. Kuyruk TÜKETİLMEZ (peek): geçiş
  // fiilen başlayınca gerçek "next" atılır. Arada öncelikli istek gelirse dönen
  // video farklı olur; o durumda tampon boşa gider, ses akışı bozulmaz.
  const preloadNext = useCallback(async () => {
    const anchor = currentVideoRef.current;
    if (!anchor || preloadedForRef.current === anchor) return;
    preloadedForRef.current = anchor;

    const result = await api({ action: "peek" });
    const videoId = result?.video_id;
    // Şarkı bu arada değiştiyse tampon geçersiz
    if (!videoId || currentVideoRef.current !== anchor) return;

    const deck = otherDeck(activeDeckRef.current);
    const player = decksRef.current[deck];
    if (!player || !deckReadyRef.current[deck]) return;
    try {
      // Sessize alınmış olarak tamponlanır: cue çalmaz ama tarayıcı yine de
      // sesi açarsa mekanda duyulmasın
      player.setVolume(0);
      player.mute?.();
      player.cueVideoById(videoId);
      preloadedVideoRef.current = videoId;
    } catch {}
  }, [api]);

  // Çapraz geçişi başlat: sıradakini boştaki deck'te çaldır, çıkanın sesini
  // 0'a indirirken girenin sesini mekanın seviyesine çıkar.
  const startCrossfade = useCallback(async () => {
    if (fadingRef.current || advancingRef.current) return;
    const ms = crossfadeMsRef.current;
    const from = activeDeckRef.current;
    const to = otherDeck(from);
    const outgoing = decksRef.current[from];
    const incoming = decksRef.current[to];
    if (ms <= 0 || !outgoing || !incoming || !deckReadyRef.current[to]) return;

    fadingRef.current = true;
    setFadeMs(ms);
    setFading(true);

    // Kuyruğu ŞİMDİ ilerlet: yeni şarkı bu andan itibaren duyuluyor, panelin ve
    // müşteri ekranının "şu an çalan"ı da bu anda değişmeli.
    advancingRef.current = true;
    let result: PlayerApiResult | null = null;
    try {
      result = await api({ action: "next" });
    } finally {
      advancingRef.current = false;
    }

    // İstek sürerken araya komut girmiş olabilir (panelden atlama, duraklatma,
    // sahiplik kaybı): endCrossfade bayrağı düşürür ve geçiş iptal edilmiştir.
    // Sunucuya yazılan yeni şarkıyı Realtime/reconcile zaten aktif deck'e yükler.
    if (!fadingRef.current) return;

    const videoId = result?.started ? result.video_id : null;
    if (!videoId) {
      // Sıradaki yok (kuyruk boş) ya da istek düştü: geçişten vazgeç, şarkı
      // normal şekilde bitsin — ENDED zaten idle ekranını getirir
      endCrossfade();
      return;
    }

    try {
      incoming.setVolume(0);
      incoming.unMute?.();
      // Tampon tuttuysa doğrudan çal; kuyruk değiştiyse (öncelikli istek) yükle
      if (preloadedVideoRef.current === videoId) incoming.playVideo();
      else incoming.loadVideoById(videoId);
    } catch {}

    // Aktiflik ANINDA devredilir: heartbeat, ses bekçisi, realtime karşılaştırması
    // hepsi artık yeni şarkıyı esas alır (now_playing da onu gösteriyor)
    activeDeckRef.current = to;
    currentVideoRef.current = videoId;
    desiredPlayingRef.current = true;
    lastLoadAtRef.current = Date.now();
    preloadedVideoRef.current = null;
    preloadedForRef.current = null;
    setVisibleDeck(to);
    setIdle(false);
    onTrackChange?.({ videoId, isPlaying: true });
    broadcastState({ video_id: videoId, is_playing: true, progress_ms: 0, duration_ms: null });

    // Eşit güç (sin/cos) rampa: iki şarkının toplam gücü sabit kalır. Doğrusal
    // rampada geçişin ortasında duyulur bir ses çukuru oluşuyor.
    const target = volumeRef.current ?? 100;
    const startedAt = Date.now();
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    fadeTimerRef.current = setInterval(() => {
      const x = Math.min((Date.now() - startedAt) / ms, 1);
      try {
        outgoing.setVolume(Math.round(target * Math.cos((x * Math.PI) / 2)));
      } catch {}
      try {
        incoming.setVolume(Math.round(target * Math.sin((x * Math.PI) / 2)));
      } catch {}
      if (x >= 1) {
        endCrossfade();
        ensurePlaying();
        sendHeartbeat();
      }
    }, FADE_STEP_MS);
  }, [api, endCrossfade, ensurePlaying, sendHeartbeat, onTrackChange, broadcastState]);

  // Kalan süre bekçisi: önyükleme ve geçiş başlangıcı buradan tetiklenir
  const crossfadeTick = useCallback(() => {
    const ms = crossfadeMsRef.current;
    if (
      ms <= 0 ||
      !canCrossfadeRef.current ||
      volumeIgnoredRef.current ||
      fadingRef.current ||
      advancingRef.current ||
      blockedRef.current ||
      !desiredPlayingRef.current ||
      !currentVideoRef.current
    ) {
      return;
    }
    const player = activePlayer();
    if (!player || !activeReady()) return;

    let duration = 0;
    let position = 0;
    try {
      if (player.getPlayerState() !== window.YT?.PlayerState.PLAYING) return;
      duration = player.getDuration();
      position = player.getCurrentTime();
    } catch {
      return;
    }
    // Süre bilinmiyorsa (canlı yayın, henüz meta gelmemiş) geçiş yapılamaz
    if (!Number.isFinite(duration) || duration <= 0) return;

    const fadeSec = ms / 1000;
    if (duration < MIN_SONG_FOR_FADE(fadeSec)) return;

    const remaining = duration - position;
    if (remaining <= fadeSec + PRELOAD_LEAD_SEC) preloadNext();
    // Alt sınır: sekme kısılmışken bekçi geç uyanırsa şarkının son kırıntısında
    // geçiş başlatmanın anlamı yok, ENDED zaten devralır
    if (remaining <= fadeSec && remaining > 0.4) startCrossfade();
  }, [activePlayer, activeReady, preloadNext, startCrossfade]);

  // Bekçi: çalması gereken video CUED/UNSTARTED'da takıldıysa (arka plan
  // sekmesinde autoplay engeli) oynatmayı tekrar dene — tek seferlik playVideo
  // denemesi engellenince şarkı sonsuza dek bekliyordu
  const nudgePlayback = useCallback(() => {
    const player = activePlayer();
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
  }, [activePlayer]);

  // Emniyet ağı: Realtime kanalı arka plan sekmesinde sessizce kopabilir ve
  // panelden gelen next/play komutları kaçar — now_playing ile mutabakat kur
  const reconcile = useCallback(async () => {
    if (advancingRef.current || fadingRef.current) return;
    const np = await readNowPlaying(supabase, venueDbId);
    if (!np || advancingRef.current || fadingRef.current) return;
    // Realtime kopmuşken değişen ses seviyesi/geçiş süresi de burada yakalanır
    if (np.volume !== volumeRef.current) applyVolume(np.volume);
    applyCrossfade(np.crossfade_ms);
    if (np.video_id && np.video_id !== currentVideoRef.current) {
      loadVideo(np.video_id);
      return;
    }
    if (np.video_id && np.is_playing) {
      desiredPlayingRef.current = true;
      nudgePlayback();
    }
  }, [supabase, venueDbId, loadVideo, nudgePlayback, applyVolume, applyCrossfade]);

  // Bir deck kur. İki deck de aynı olay kancalarını paylaşır; olayların çoğu
  // yalnızca AKTİF deck için anlamlıdır (boştaki deck'in ENDED'i kuyruğu
  // ilerletmemeli, tamponlanan videonun CUED'i çalmayı başlatmamalı).
  const createDeck = useCallback(
    (key: DeckKey, host: HTMLDivElement): YTPlayer => {
      const el = document.createElement("div");
      host.replaceChildren(el);
      deckReadyRef.current[key] = false;

      return new window.YT!.Player(el, {
        playerVars: { playsinline: 1, rel: 0, autoplay: 0 },
        events: {
          onReady: async () => {
            deckReadyRef.current[key] = true;
            if (key !== activeDeckRef.current) {
              // Boştaki deck sessiz bekler: tamponlanan video kazara çalarsa
              // mekanda duyulmasın
              try {
                decksRef.current[key]?.setVolume(0);
                decksRef.current[key]?.mute?.();
              } catch {}
              return;
            }
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
            applyCrossfade(np?.crossfade_ms);
            if (np?.video_id) {
              loadVideo(np.video_id);
            } else {
              advance({ action: "next" });
            }
          },
          onStateChange: (e) => {
            const YT = window.YT!;
            // Boştaki deck'in olayları çalma akışını yönetmez. Geçiş sırasında
            // çıkan şarkı burada biter (ENDED) — kuyruğu ikinci kez ilerletmemeli.
            if (key !== activeDeckRef.current) return;
            if (e.data === YT.PlayerState.ENDED) {
              advance({ action: "next" });
            } else if (e.data === YT.PlayerState.PLAYING) {
              desiredPlayingRef.current = true;
              // Yeni video/aygıt değişiminde player varsayılan sese dönebilir
              // (geçiş sırasında pushVolume kendini devre dışı bırakır)
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
              decksRef.current[key]?.playVideo();
            }
          },
          onError: () => {
            // 100/101/150: video kaldırılmış ya da embed'e kapalı — işaretle ve atla
            if (key !== activeDeckRef.current) {
              // Tamponlanan video çalınamıyor: tamponu düşür, geçiş anında
              // sunucudan dönen kimlik zaten yüklenecek
              preloadedVideoRef.current = null;
              return;
            }
            endCrossfade();
            const failed = currentVideoRef.current;
            if (failed) advance({ action: "error", video_id: failed });
            else advance({ action: "next" });
          },
        },
      });
    },
    [
      advance,
      loadVideo,
      sendHeartbeat,
      onTrackChange,
      supabase,
      venueDbId,
      applyVolume,
      applyCrossfade,
      pushVolume,
      endCrossfade,
    ]
  );

  // "Başlat" — tarayıcı autoplay politikası gereği ilk oynatma kullanıcı dokunuşuyla.
  // Önce sahiplik alınır: aynı mekanda ikinci bir sekme/cihaz açıksa çift ses olmasın.
  const start = useCallback(
    async (force = false) => {
      setError("");

      const claim = await api({ action: "claim", force });
      if (blockedRef.current === "auth") return;
      if (claim?.taken) {
        setClaimTaken(true);
        return;
      }
      setClaimTaken(false);

      await loadIframeApi();
      const hostA = deckAHostRef.current;
      const hostB = deckBHostRef.current;
      if (!hostA || !hostB || !window.YT) {
        setError("YouTube player yüklenemedi — sayfayı yenileyin");
        return;
      }

      canCrossfadeRef.current = deviceSupportsVolume();
      activeDeckRef.current = "a";
      setVisibleDeck("a");
      pendingVideoRef.current = null;
      // İki deck de kullanıcı dokunuşunun hemen ardından kurulur: ikincisinin de
      // autoplay izni bu etkileşimden gelir, geçiş anında sessizce engellenmesin
      decksRef.current.a = createDeck("a", hostA);
      decksRef.current.b = createDeck("b", hostB);

      setStarted(true);
    },
    [api, createDeck]
  );

  // Sahiplik başka cihaza geçtiyse bu sekme derhal susar — çift ses olmasın
  useEffect(() => {
    if (blocked !== "claim") return;
    desiredPlayingRef.current = false;
    endCrossfade();
    try {
      decksRef.current.a?.pauseVideo();
      decksRef.current.b?.pauseVideo();
    } catch {}
  }, [blocked, endCrossfade]);

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

  // Crossfade bekçisi: kalan süreyi izler, önyükler ve geçişi başlatır
  useEffect(() => {
    if (!started || blocked) return;
    const interval = setInterval(crossfadeTick, CROSSFADE_TICK_MS);
    return () => clearInterval(interval);
  }, [started, blocked, crossfadeTick]);

  // HIZLI HAT: panelin oynat/duraklat/atla/ses komutları doğrudan buraya düşer.
  // Aşağıdaki now_playing aboneliği yerini almaz — o kalıcı ve garanti yol, bu
  // ise gecikmesizi. Aynı komut iki yoldan da gelir; ikincisi zaten no-op olur.
  useEffect(() => {
    if (!started || blocked === "claim") return;

    const channel = playerBusChannel(supabase, venueDbId);
    channel
      .on("broadcast", { event: CMD_EVENT }, ({ payload }: { payload: PlayerCommand }) => {
        if (blockedRef.current === "claim") return;
        const cmd = payload;
        if (!cmd?.type) return;
        switch (cmd.type) {
          case "play": {
            desiredPlayingRef.current = true;
            try {
              activePlayer()?.playVideo();
            } catch {}
            // Arka plan sekmesinde engellenirse bekçi toparlasın
            scheduleNudges([PLAY_NUDGE_MS]);
            break;
          }
          case "pause": {
            // Panelin açık komutu: DB yolundaki "yankı mı, komut mu" belirsizliği
            // burada yok — doğrudan uygulanır
            desiredPlayingRef.current = false;
            endCrossfade();
            try {
              activePlayer()?.pauseVideo();
            } catch {}
            broadcastState({ is_playing: false });
            break;
          }
          case "seeking": {
            // Atlama isteği sunucuya gitti: sürmekte olan geçişi kes ki gelen
            // şarkı yarım rampanın üstüne binmesin
            endCrossfade();
            break;
          }
          case "load": {
            if (cmd.video_id && cmd.video_id !== currentVideoRef.current) loadVideo(cmd.video_id);
            break;
          }
          case "volume": {
            applyVolume(cmd.volume);
            break;
          }
        }
      })
      .subscribe();
    busRef.current = channel;

    return () => {
      busRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [
    started,
    blocked,
    supabase,
    venueDbId,
    activePlayer,
    scheduleNudges,
    endCrossfade,
    loadVideo,
    applyVolume,
    broadcastState,
  ]);

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
          applyCrossfade(np.crossfade_ms);
          // Panelden "baştan başlat": aynı video, ilerleme sıfırlanmış. Şarkının
          // ilk saniyelerinde gelen heartbeat yankısı da sıfır taşır; o yüzden
          // yalnızca gerçekten ilerlemiş bir videoda başa sarılır. Yeni yüklenen
          // videonun kendi "next" yazması da (crossfade dahil) progress 0 taşır —
          // grace penceresi onu eler.
          if (
            np.video_id &&
            np.video_id === currentVideoRef.current &&
            (np.progress_ms ?? -1) === 0 &&
            !fadingRef.current &&
            Date.now() - lastLoadAtRef.current > PAUSE_ECHO_GRACE_MS
          ) {
            let elapsed = 0;
            try {
              elapsed = (activePlayer()?.getCurrentTime() ?? 0) * 1000;
            } catch {}
            if (elapsed > 2_000) {
              try {
                activePlayer()?.seekTo(0, true);
                if (np.is_playing) activePlayer()?.playVideo();
              } catch {}
              return;
            }
          }
          if (np.video_id && np.video_id !== currentVideoRef.current) {
            loadVideo(np.video_id);
            return;
          }
          if (!np.video_id && currentVideoRef.current) {
            endCrossfade();
            currentVideoRef.current = null;
            desiredPlayingRef.current = false;
            setIdle(true);
            pendingVideoRef.current = null;
            preloadedVideoRef.current = null;
            preloadedForRef.current = null;
            try {
              activePlayer()?.pauseVideo();
            } catch {}
            onTrackChange?.({ videoId: null, isPlaying: false });
            return;
          }
          // Aynı video, oynat/duraklat komutu
          if (np.video_id) {
            if (np.is_playing) {
              desiredPlayingRef.current = true;
              try {
                activePlayer()?.playVideo();
              } catch {}
              scheduleNudges([PLAY_NUDGE_MS]);
            } else {
              // "Durdu" gerçek bir duraklatma komutu mu, yoksa takılı player'ın
              // kendi heartbeat'inin yankısı mı? Hiç başlamamış (CUED/UNSTARTED)
              // videoda ve yüklemeden hemen sonra niyet söndürülmez — söndürülürse
              // bekçi devre dışı kalır ve şarkı sonsuza dek bekler
              let neverStarted = false;
              try {
                const s = activePlayer()?.getPlayerState();
                neverStarted = s === window.YT?.PlayerState.CUED || s === -1;
              } catch {}
              if (!neverStarted && Date.now() - lastLoadAtRef.current > PAUSE_ECHO_GRACE_MS) {
                desiredPlayingRef.current = false;
                // Duraklatma geçişi de keser: iki şarkı yarım rampada donmasın
                endCrossfade();
                try {
                  activePlayer()?.pauseVideo();
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
  }, [
    started,
    blocked,
    supabase,
    venueDbId,
    loadVideo,
    onTrackChange,
    scheduleNudges,
    applyVolume,
    applyCrossfade,
    endCrossfade,
    activePlayer,
  ]);

  // "Çalmayı buraya al": sahipliği zorla devral ve kaldığı yerden sürdür
  const takeOver = useCallback(async () => {
    const result = await api({ action: "claim", force: true });
    if (!result?.claimed) return;
    setClaimTaken(false);
    setBlock(null);
    reconcile();
  }, [api, setBlock, reconcile]);

  // Sekme/pencere kapanırken sahipliği bırak. Aksi halde kilit 45 sn bayatlayana
  // kadar duruyor ve player hemen yeniden açıldığında kendi eski kilidimiz yüzünden
  // "başka bir cihazda açık" uyarısı çıkıyordu (sessionStorage kimliği sekmeye özel).
  useEffect(() => {
    if (!started) return;
    const url = `/api/player/${venueDbId}`;
    const release = () => {
      const body = JSON.stringify({ action: "release", claim_id: claimId() });
      try {
        // sendBeacon kapanış sırasında da teslim edilir; aynı origin olduğu için cookie gider
        if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
      } catch {}
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };
    // pagehide: kapanış + mobil arka plan (beforeunload iOS'ta çalışmaz).
    // bfcache'ten geri dönülürse heartbeat sahipliği yeniden yazar.
    window.addEventListener("pagehide", release);
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    return () => {
      window.removeEventListener("pagehide", release);
      // Kısa gecikme: StrictMode geliştirmede effect'i mount→cleanup→mount
      // çalıştırır; hemen bırakırsak daha yeni başlamış player'ın kilidini
      // kendimiz düşürürüz. Gerçek kapanışı zaten pagehide yakalıyor.
      releaseTimerRef.current = setTimeout(release, 300);
    };
  }, [started, venueDbId, claimId]);

  // "Başka cihazda açık" ekranı asılı kalmasın: diğer sekme kapandığında ya da
  // kilit bayatladığında kendiliğinden normal "Başlat" ekranına dönsün.
  useEffect(() => {
    if (!claimTaken) return;
    const probe = async () => {
      const result = await api({ action: "claim", probe: true });
      if (result && result.taken !== true) setClaimTaken(false);
    };
    const interval = setInterval(probe, 5_000);
    return () => clearInterval(interval);
  }, [claimTaken, api]);

  useEffect(() => {
    return () => {
      nudgeTimersRef.current.forEach(clearTimeout);
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      try {
        decksRef.current.a?.destroy();
        decksRef.current.b?.destroy();
      } catch {}
      decksRef.current = { a: null, b: null };
      deckReadyRef.current = { a: false, b: false };
    };
  }, []);

  // Görsel çapraz geçiş: iki iframe üst üste durur, geçiş boyunca çıkan solar,
  // giren belirir. Sesle aynı süre. YouTube kuralı gereği ikisi de ekrandadır,
  // üzerlerine hiçbir şey bindirilmez.
  const deckStyle = (key: DeckKey): React.CSSProperties => ({
    opacity: visibleDeck === key ? 1 : 0,
    transition: `opacity ${fading ? fadeMs : 200}ms linear`,
    // Görünmeyen deck tıklamaları yutmasın (YouTube kendi kontrollerini gösterir)
    pointerEvents: visibleDeck === key ? "auto" : "none",
  });

  return (
    <div className="relative w-full">
      {/* YouTube kuralı: video görünür kalmalı, üzerine hiçbir şey bindirilemez */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black [&_iframe]:h-full [&_iframe]:w-full">
        <div ref={deckAHostRef} className="absolute inset-0" style={deckStyle("a")} />
        <div ref={deckBHostRef} className="absolute inset-0" style={deckStyle("b")} />
      </div>

      {/* Cihaz ses komutunu kabul etmiyorsa (mobil tarayıcılarda ses donanımdan
          yönetilir) mekan bunu ekranda görsün — panelde boşuna uğraşmasın */}
      {volumeIgnored && (
        <p className="mt-2 text-center text-xs text-[#fbbf24]">
          Bu cihaz uzaktan ses ayarını kabul etmiyor — sesi cihazın kendi düğmelerinden
          ayarlayın. Uzaktan kontrol ve çapraz geçiş için player&apos;ı bilgisayarda açın.
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
