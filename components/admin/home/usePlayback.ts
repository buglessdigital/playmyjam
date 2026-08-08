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

export type QueueItem = {
  id: string;
  user_id: string | null;
  added_by: string;
  tokens_spent: number;
  priority: boolean;
  position: number;
  added_at: string;
  songs: {
    youtube_video_id: string;
    title: string;
    artist: string;
    album_cover_url: string;
    duration_ms: number;
  };
};

export type NowPlaying = {
  video_id?: string | null;
  is_playing: boolean;
  progress_ms: number;
  started_at: string | null;
  last_heartbeat_at: string | null;
  volume?: number | null;
  songs: { title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

const NP_COLUMNS = "video_id, is_playing, progress_ms, started_at, last_heartbeat_at, volume";
// 0036 uygulanmadan deploy edilirse volume kolonu yoktur; select'in tamamı
// düşüp panel boş kalmasın diye kolonsuz sürüme dönülür
const NP_COLUMNS_LEGACY = "video_id, is_playing, progress_ms, started_at, last_heartbeat_at";
const NP_SONGS = "songs(title, artist, album_cover_url, duration_ms)";
let volumeColumnMissing = false;

const QUEUE_SELECT =
  "id, user_id, added_by, tokens_spent, priority, position, added_at, songs(youtube_video_id, title, artist, album_cover_url, duration_ms)";

// Player 15 sn'de bir heartbeat yollar — bunun ~3 katı sessizlik "çevrimdışı" sayılır
const OFFLINE_AFTER_MS = 45_000;
// İlerleme çubuğu tick aralığı
const TICK_MS = 250;

// Müşterinin jetonla aldığı sıra taşınamaz; taşınabilen tek blok otomatik/elle
// eklenen şarkılardır (user_id null). Sunucu tarafı da aynı kuralı uygular.
export const isMovable = (item: QueueItem) => item.user_id === null;

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Ana ekranın alt barı ve kuyruk paneli: şu an çalan, ilerleme, ses ve kuyruk.
 * Mekanın veritabanı id'si dışarıdan gelir — sayfa slug'ı bir kez çözer.
 */
export function usePlayback(venueDbId: string) {
  const supabase = useMemo(() => createClient(), []);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const [playerLoading, setPlayerLoading] = useState<string | null>(null);
  const [volume, setVolume] = useState(100);
  const [volumeError, setVolumeError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Sessize alma eski seviyeyi hatırlar (ayrı bir mute kolonu yok — bkz. 0036)
  const lastAudibleVolumeRef = useRef(100);
  const volumeTouchedAtRef = useRef(0);
  const volumeSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Düğmeye basıldığı an: bu pencere içinde sunucudan gelen ESKİ durum
  // (henüz yazılmamış satır ya da yoldaki bayat heartbeat) ekrandaki iyimser
  // durumu ezmesin — düğme basılır basılmaz geri sıçrıyordu.
  const localActionAtRef = useRef(0);
  // Player'ın broadcast ettiği canlı durum: DB turunu beklemeden uygulanır
  const busRef = useRef<ReturnType<typeof playerBusChannel> | null>(null);
  const nowPlayingRef = useRef<NowPlaying | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const fetchQueue = useCallback(
    async (dbId: string) => {
      const { data } = await supabase
        .from("queue")
        .select(QUEUE_SELECT)
        .eq("venue_id", dbId)
        .eq("status", "queued")
        // added_at + id: beraberlik kırıcı (0034). Öncelikli satırların hepsi
        // position = 0 ile yazılıyor; bunlar olmadan sıra rastgele kayıyordu.
        .order("priority", { ascending: false })
        .order("position", { ascending: true })
        .order("added_at", { ascending: true })
        .order("id", { ascending: true });
      if (data) setQueue(data as unknown as QueueItem[]);
    },
    [supabase]
  );

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Şu an çalan: YouTube'a sormak yerine now_playing tablosu Realtime ile izlenir
    const fetchNowPlaying = async () => {
      const run = () =>
        supabase
          .from("now_playing")
          .select(`${volumeColumnMissing ? NP_COLUMNS_LEGACY : NP_COLUMNS}, ${NP_SONGS}`)
          .eq("venue_id", venueDbId)
          .maybeSingle();
      const first = await run();
      let data = first.data;
      if (first.error && !volumeColumnMissing) {
        volumeColumnMissing = true;
        ({ data } = await run());
      }
      if (cancelled || !data) return;
      const raw = data as unknown as Omit<NowPlaying, "songs"> & {
        songs: NowPlaying["songs"] | NowPlaying["songs"][];
      };
      const songs = Array.isArray(raw.songs) ? raw.songs[0] ?? null : raw.songs;
      // Az önce düğmeye basıldıysa çalma durumunu sunucudan geri alma: satır
      // henüz yazılmamış ya da yoldaki heartbeat bayat olabilir. Şarkı/kapak
      // bilgisi yine tazelenir, yalnızca oynat/duraklat ekseni korunur.
      const fresh = Date.now() - localActionAtRef.current < 2_500;
      setNowPlaying((prev) =>
        fresh && prev
          ? { ...raw, songs, is_playing: prev.is_playing, started_at: prev.started_at }
          : { ...raw, songs }
      );
      if (fresh) return;
      // Kaydırıcıyı sunucudan tazele — ama kullanıcı az önce oynadıysa dokunma,
      // yoksa henüz yazılmamış değer parmağın altından geri sıçrar
      if (typeof raw.volume === "number" && Date.now() - volumeTouchedAtRef.current > 2_000) {
        setVolume(raw.volume);
        if (raw.volume > 0) lastAudibleVolumeRef.current = raw.volume;
      }
      // İlerlemeyi started_at çapasından hesapla — progress_ms yazıldığı andan itibaren bayat.
      // Player kapalıysa çapa geçersiz (kimse çalmıyor): son yazılan değerde donar.
      const beat = raw.last_heartbeat_at ? Date.parse(raw.last_heartbeat_at) : NaN;
      const online = Number.isFinite(beat) && Date.now() - beat <= OFFLINE_AFTER_MS;
      if (online && raw.is_playing && raw.started_at) {
        setProgress(Math.max(Date.now() - Date.parse(raw.started_at), 0));
      } else {
        setProgress(raw.progress_ms ?? 0);
      }
    };

    const reloadQueue = () => {
      if (!cancelled) fetchQueue(venueDbId);
    };

    fetchNowPlaying();
    reloadQueue();

    // Realtime kanalı sessizce düşerse (uyuyan sekme, wifi kesintisi, Supabase
    // yeniden bağlanması) panel son heartbeat'i öğrenemez ve player açıkken bile
    // 45 sn sonra "çevrimdışı" der. Bu yüzden düzenli yoklama + sekme/ağ geri
    // gelince tazeleme: Realtime yalnız hızlandırıcı, tek kaynak değil.
    const poll = setInterval(fetchNowPlaying, 15_000);
    const onWake = () => {
      if (document.visibilityState === "visible") fetchNowPlaying();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    // Kanal adları benzersiz: aynı topic'e ikinci abonelik (sekme geri gelince
    // yeniden mount) eskisini düşürüp panelin akışını kesiyordu
    const suffix = Math.random().toString(36).slice(2);

    channels.push(
      supabase
        .channel(`admin-np:${venueDbId}:${suffix}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` },
          fetchNowPlaying
        )
        .subscribe(),
      supabase
        .channel(`admin-queue:${venueDbId}:${suffix}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueDbId}` },
          reloadQueue
        )
        .subscribe()
    );

    // Düşük gecikmeli hat: player kendi durumunu (ilerleme/çalıyor mu/hangi video)
    // doğrudan buraya yollar. DB → WAL → Realtime turu beklenmediği için alt bar
    // player'la aynı anda tepki verir. Kalıcı değil; yukarıdaki DB yolu duruyor.
    const bus = playerBusChannel(supabase, venueDbId);
    bus
      .on("broadcast", { event: STATE_EVENT }, ({ payload }: { payload: PlayerStateBeat }) => {
        const beat = payload;
        if (cancelled || !beat || typeof beat.progress_ms !== "number") return;
        // Broadcast'in kendisi "player ayakta" kanıtıdır: heartbeat tazeliğini
        // de burada güncelleriz, "çevrimdışı" uyarısı boşuna çıkmasın.
        const seenAt = new Date().toISOString();
        const current = nowPlayingRef.current;
        // Şarkı değişmiş: satırın tamamı (başlık/kapak/süre) lazım, hemen tazele
        if (current?.video_id != null && beat.video_id !== current.video_id) {
          setNowPlaying({ ...current, last_heartbeat_at: seenAt });
          fetchNowPlaying();
          return;
        }
        setProgress(beat.progress_ms);
        setNowPlaying((prev) =>
          prev
            ? {
                ...prev,
                is_playing: beat.is_playing,
                progress_ms: beat.progress_ms,
                started_at: beat.is_playing
                  ? new Date(Date.now() - beat.progress_ms).toISOString()
                  : prev.started_at,
                last_heartbeat_at: seenAt,
              }
            : prev
        );
        // Player'ın raporladığı durum artık iyimser tahminin yerini alır
        localActionAtRef.current = 0;
      })
      .subscribe();
    busRef.current = bus;

    return () => {
      cancelled = true;
      busRef.current = null;
      supabase.removeChannel(bus);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [venueDbId, supabase, fetchQueue]);

  // Progress + heartbeat tazeliği için tick. 250 ms: çubuk player'a takılmadan
  // ilerlesin, saniye yazısı gecikmeli görünmesin.
  useEffect(() => {
    if (!nowPlaying) return;
    const interval = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      // Player kapalıyken ilerlemeyi ilerletme: veri donmuş durumda ve saatten
      // hesaplanan çubuk "çalıyor" yalanı söyler (bkz. lib/player-status.ts).
      const beat = nowPlaying.last_heartbeat_at ? Date.parse(nowPlaying.last_heartbeat_at) : NaN;
      if (!Number.isFinite(beat) || tick - beat > OFFLINE_AFTER_MS) return;
      if (nowPlaying.is_playing) {
        const dur = nowPlaying.songs?.duration_ms ?? 0;
        if (nowPlaying.started_at) {
          setProgress(Math.min(Math.max(Date.now() - Date.parse(nowPlaying.started_at), 0), dur));
        } else {
          setProgress((p) => Math.min(p + TICK_MS, dur));
        }
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [nowPlaying]);

  useEffect(
    () => () => {
      if (volumeSendRef.current) clearTimeout(volumeSendRef.current);
    },
    []
  );

  // Komutu player'a doğrudan yolla (HTTP + DB turunu beklemeden). Teslim garantisi
  // yoktur; her komut ayrıca /api/player'a da gider.
  const sendCommand = (command: PlayerCommand) => {
    try {
      busRef.current?.send({ type: "broadcast", event: CMD_EVENT, payload: command });
    } catch {}
  };

  const playerAction = async (action: "play" | "pause" | "next" | "previous") => {
    if (!venueDbId) return;
    localActionAtRef.current = Date.now();

    // Düğme anında tepki versin: sunucu + Realtime turunu beklemeden hem player'a
    // komut gider hem de durum ekranda değişir. Gelen gerçek satır üzerine yazar.
    if (action === "play" || action === "pause") {
      sendCommand({ type: action });
      const playing = action === "play";
      setNowPlaying((prev) =>
        prev
          ? {
              ...prev,
              is_playing: playing,
              // Çalmaya devam çapası şimdiden kaydırılır ki çubuk geri sıçramasın
              started_at: playing ? new Date(Date.now() - progress).toISOString() : prev.started_at,
            }
          : prev
      );
    } else {
      // Atlamada hangi videonun çalacağını sunucu söyler; player'a "hazırlan"
      // deyip yanıtı bekliyoruz. Panel bu arada sıradaki şarkıyı iyimser gösterir.
      sendCommand({ type: "seeking" });
      setProgress(0);
      if (action === "next") {
        const upcoming = queueRef.current[0];
        if (upcoming?.songs) {
          setNowPlaying((prev) =>
            prev
              ? {
                  ...prev,
                  video_id: upcoming.songs.youtube_video_id,
                  songs: upcoming.songs,
                  is_playing: true,
                  progress_ms: 0,
                  started_at: new Date().toISOString(),
                }
              : prev
          );
          // Kuyruktan da düşür — gerçek satır Realtime ile birazdan doğrular
          setQueue((prev) => prev.slice(1));
        }
      }
    }

    setPlayerLoading(action);
    try {
      const res = await fetch(`/api/player/${venueDbId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // Yanıttaki video kimliğini player'a anında ilet: aksi halde player aynı
      // bilgiyi DB → Realtime turundan öğrenecek ve şarkı ~1 sn geç başlayacaktı
      if ((action === "next" || action === "previous") && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.started && typeof data.video_id === "string") {
          sendCommand({ type: "load", video_id: data.video_id });
        }
      }
    } finally {
      setPlayerLoading(null);
    }
  };

  // Kaydırıcı anında tepki verir, sunucuya yazma 250 ms sonra: sürüklerken
  // onlarca istek gitmesin. Player değişikliği Realtime ile duyar.
  const changeVolume = (next: number) => {
    if (!venueDbId) return;
    const value = Math.min(100, Math.max(0, Math.round(next)));
    setVolume(value);
    volumeTouchedAtRef.current = Date.now();
    if (value > 0) lastAudibleVolumeRef.current = value;
    // Ses de anında uygulansın: yazma 250 ms sonra, kulaktaki değişim şimdi
    sendCommand({ type: "volume", volume: value });
    if (volumeSendRef.current) clearTimeout(volumeSendRef.current);
    volumeSendRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/player/${venueDbId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "volume", volume: value }),
        });
        setVolumeError(res.ok ? "" : "Ses seviyesi kaydedilemedi");
      } catch {
        setVolumeError("Ses seviyesi kaydedilemedi");
      }
    }, 250);
  };

  const toggleMute = () => changeVolume(volume === 0 ? lastAudibleVolumeRef.current || 100 : 0);

  const removeFromQueue = async (id: string) => {
    const res = await fetch("/api/admin/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue_id: id, status: "removed" }),
    });
    if (res.ok) setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  // Yeni sırayı önce ekranda uygular, sonra sunucuya yazar. Sunucu reddederse
  // (araya otomatik dolum girmişse) liste tazelenip gerçek durum gösterilir.
  const persistOrder = async (next: QueueItem[]) => {
    const previous = queue;
    setQueue(next);
    setQueueError("");
    setReordering(true);
    try {
      const res = await fetch("/api/admin/queue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next.filter(isMovable).map((q) => q.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQueueError(data.error ?? "Sıra kaydedilemedi");
        if (venueDbId) await fetchQueue(venueDbId);
        else setQueue(previous);
      }
    } catch {
      setQueueError("Bağlantı hatası, sıra kaydedilemedi");
      setQueue(previous);
    } finally {
      setReordering(false);
    }
  };

  // Taşınabilir blok kuyruğun sonunda tek parça durur (müşteri satırları
  // position < 9000). Bu yüzden taşıma, blok içi indeks değişiminden ibaret.
  const moveWithinAuto = (fromId: string, toId: string) => {
    const movable = queue.filter(isMovable);
    const from = movable.findIndex((q) => q.id === fromId);
    const to = movable.findIndex((q) => q.id === toId);
    if (from < 0 || to < 0 || from === to) return;

    const reordered = [...movable];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    persistOrder([...queue.filter((q) => !isMovable(q)), ...reordered]);
  };

  const nudge = (id: string, delta: -1 | 1) => {
    const movable = queue.filter(isMovable);
    const index = movable.findIndex((q) => q.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= movable.length) return;
    moveWithinAuto(id, movable[target].id);
  };

  // Katalogdan ya da aramadan kuyruğa doğrudan ekleme (jeton harcanmaz)
  const addToQueue = async (track: {
    youtube_video_id: string;
    title: string;
    artist: string;
    album_cover_url: string | null;
    duration_ms: number;
  }) => {
    const res = await fetch("/api/admin/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(track),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: (data.error as string) ?? "Eklenemedi" };
    if (venueDbId) await fetchQueue(venueDbId);
    return { ok: true as const };
  };

  const queuedVideoIds = useMemo(
    () => new Set(queue.map((q) => q.songs?.youtube_video_id).filter(Boolean)),
    [queue]
  );

  const duration = nowPlaying?.songs?.duration_ms ?? 1;
  const progressPct = Math.min((progress / duration) * 100, 100);

  // Player sekmesi hiç açılmadıysa ya da heartbeat kesildiyse uyar
  const heartbeatAge = nowPlaying?.last_heartbeat_at
    ? now - Date.parse(nowPlaying.last_heartbeat_at)
    : Infinity;

  return {
    queue,
    queuedVideoIds,
    nowPlaying,
    progress,
    progressPct,
    duration,
    isPlaying: nowPlaying?.is_playing ?? false,
    playerOffline: heartbeatAge > OFFLINE_AFTER_MS,
    playerLoading,
    volume,
    volumeError,
    queueError,
    reordering,
    playerAction,
    changeVolume,
    toggleMute,
    removeFromQueue,
    moveWithinAuto,
    nudge,
    addToQueue,
    movableCount: queue.filter(isMovable).length,
  };
}

export type Playback = ReturnType<typeof usePlayback>;
