"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  // Otomatik satırın hangi listeden geldiği (0032). Müşteri isteklerinde ve
  // adminin elle eklediklerinde null.
  source_playlist_id: string | null;
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
  "id, user_id, added_by, tokens_spent, priority, position, added_at, source_playlist_id, songs(youtube_video_id, title, artist, album_cover_url, duration_ms)";

// Player 15 sn'de bir heartbeat yollar — bunun ~3 katı sessizlik "çevrimdışı" sayılır
const OFFLINE_AFTER_MS = 45_000;
// İlerleme çubuğu tick aralığı
const TICK_MS = 250;
// Sarma sonrası koruma penceresi: bu süre boyunca dışarıdan gelen ilerleme
// değerleri yok sayılır (yoldaki heartbeat'ler henüz eski konumu taşıyor).
const SEEK_GUARD_MS = 2_000;

// Müşterinin jetonla aldığı sıra taşınamaz; taşınabilen tek blok otomatik/elle
// eklenen şarkılardır (user_id null). Sunucu tarafı da aynı kuralı uygular.
export const isMovable = (item: QueueItem) => item.user_id === null;

// Elle sıraya eklenen satır ("Sıraya ekle"): çalan şarkıdan hemen sonra çalar ve
// "Sırayı temizle" yalnızca bunları siler. Otomatik dolumdan gelen satırlar
// added_by='auto'dur, müşteri satırlarında kullanıcı adı yazar.
export const isManualRow = (item: QueueItem) => item.user_id === null && item.added_by === "admin";

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * İlerleme (çalan şarkının kaçıncı saniyesi) React state'inde TUTULMAZ.
 *
 * Saniyede dört kez tazelenen bir sayı state olduğunda ana ekranın tamamı —
 * playlist rayı, şarkı panosu, 500 satıra kadar uzayabilen kuyruk — saniyede
 * dört kez yeniden çiziliyordu. Oysa sayıyı yalnızca iki küçük parça gösteriyor:
 * alt bardaki sarma çubuğu ve kuyruk panosundaki mini çubuk.
 *
 * Bu yüzden değer abone olunabilir bir kutuda duruyor: yalnızca `useProgress`
 * çağıran bileşen tazelenir, panelin geri kalanı kıpırdamaz.
 */
export type ProgressStore = {
  subscribe: (cb: () => void) => () => void;
  get: () => number;
};

export function useProgress(store: ProgressStore): number {
  return useSyncExternalStore(store.subscribe, store.get, () => 0);
}

/**
 * Ana ekranın alt barı ve kuyruk paneli: şu an çalan, ilerleme, ses ve kuyruk.
 * Mekanın veritabanı id'si dışarıdan gelir — sayfa slug'ı bir kez çözer.
 */
export function usePlayback(venueDbId: string) {
  const supabase = useMemo(() => createClient(), []);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Sahnedeki satırın sahibi: müşteri şarkısıysa "şimdi çal" düğmeleri kapanır
  // (jetonla alınan sıra yarıda kesilemez). Sunucu da aynı kuralı uygular.
  const [playingRow, setPlayingRow] = useState<
    { user_id: string | null; added_by: string; source_playlist_id: string | null } | null
  >(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [playerLoading, setPlayerLoading] = useState<string | null>(null);
  const [volume, setVolume] = useState(100);
  const [volumeError, setVolumeError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [reordering, setReordering] = useState(false);
  // Player susmuş mu: 5 sn'de bir bakılır ve yalnızca DEĞİŞTİĞİNDE yazılır.
  // Eskiden bu bilgi için saniyede dört kez tazelenen bir saat state'i vardı.
  const [playerOffline, setPlayerOffline] = useState(false);

  // --- İlerleme kutusu (bkz. useProgress) ---
  const progressRef = useRef(0);
  const progressListenersRef = useRef<Set<() => void>>(new Set());
  const setProgress = useCallback((next: number | ((prev: number) => number)) => {
    const value = typeof next === "function" ? next(progressRef.current) : next;
    if (value === progressRef.current) return;
    progressRef.current = value;
    for (const cb of progressListenersRef.current) cb();
  }, []);
  const progressStore = useMemo<ProgressStore>(
    () => ({
      subscribe: (cb) => {
        progressListenersRef.current.add(cb);
        return () => progressListenersRef.current.delete(cb);
      },
      get: () => progressRef.current,
    }),
    []
  );

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
  // --- Sarma (alt bardaki ilerleme çubuğu) ---
  // Parmak çubuğun üstündeyken dışarıdan gelen hiçbir ilerleme uygulanmaz:
  // tick de, player'ın yoldaki heartbeat'i de imleci parmağın altından kaçırırdı.
  const scrubbingRef = useRef(false);
  // Bırakıldıktan sonraki koruma penceresi: player yeni konumu bildirene kadar
  // yolda olan BAYAT değerler çubuğu eski yerine geri sıçratmasın.
  const seekGuardUntilRef = useRef(0);
  const scrubIgnores = useCallback(
    () => scrubbingRef.current || Date.now() < seekGuardUntilRef.current,
    []
  );
  const nowPlayingRef = useRef<NowPlaying | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  // Sahnede olmasını beklediğimiz video: panel yeni şarkıyı sunucudan önce
  // gösterdiğinde, yoldaki bayat now_playing satırı onu geri almasın diye.
  const expectedVideoRef = useRef<{ id: string; at: number } | null>(null);
  // Ses fiilen akıyor mu (player'ın bildirdiği son durum). Şarkı değişiminde
  // YouTube videoyu birkaç saniye tamponluyor; bu sırada çubuk SAYMAZ, yoksa
  // sesin önüne geçip ilk gerçek ölçümde geri sıçrıyordu.
  const playbackStartedRef = useRef(true);
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const fetchQueue = useCallback(
    async (dbId: string) => {
      const [{ data }, { data: current }] = await Promise.all([
        supabase
          .from("queue")
          .select(QUEUE_SELECT)
          .eq("venue_id", dbId)
          .eq("status", "queued")
          // added_at + id: beraberlik kırıcı (0034). Öncelikli satırların hepsi
          // position = 0 ile yazılıyor; bunlar olmadan sıra rastgele kayıyordu.
          .order("priority", { ascending: false })
          .order("position", { ascending: true })
          .order("added_at", { ascending: true })
          .order("id", { ascending: true }),
        supabase
          .from("queue")
          .select("user_id, added_by, source_playlist_id")
          .eq("venue_id", dbId)
          .eq("status", "playing")
          .limit(1)
          .maybeSingle(),
      ]);
      if (data) setQueue(data as unknown as QueueItem[]);
      setPlayingRow(
        (current as { user_id: string | null; added_by: string; source_playlist_id: string | null } | null) ??
          null
      );
    },
    [supabase]
  );

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;
    let queueReloadTimer: ReturnType<typeof setTimeout> | null = null;
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
      // Sahnedeki şarkının BAYAT satırı gelmiş olabilir: player yeni şarkıya
      // geçtiğini yayınladı ama sunucu satırı henüz yazmadı. Bu satır uygulanırsa
      // alt bar bir önceki şarkıya geri döner — beklediğimiz video gelene kadar
      // (ya da beklenti bayatlayana kadar) yok sayılır. Doğru satır zaten
      // now_playing aboneliğiyle birazdan gelir.
      const expected = expectedVideoRef.current;
      if (expected && Date.now() - expected.at < 5_000 && raw.video_id !== expected.id) return;
      if (expected && raw.video_id === expected.id) expectedVideoRef.current = null;
      // Az önce düğmeye basıldıysa çalma durumunu sunucudan geri alma: satır
      // henüz yazılmamış ya da yoldaki heartbeat bayat olabilir. Şarkı/kapak
      // bilgisi yine tazelenir, yalnızca oynat/duraklat ekseni korunur.
      // Sarma da "az önce elle dokunuldu" sayılır: sunucudaki satır henüz eski
      // konumu taşıyor, ekrandaki taze niyeti ezmemeli.
      const fresh = Date.now() - localActionAtRef.current < 2_500 || scrubIgnores();
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
      // Ses henüz akmıyorsa (video tamponlanıyor) satırdaki çapa yanıltıcıdır:
      // started_at şarkının değil İSTEĞİN anıdır, aradaki tamponlama süresi
      // çubuğu olduğu gibi ileri atardı.
      if (!playbackStartedRef.current) return;
      if (online && raw.is_playing && raw.started_at) {
        setProgress(Math.max(Date.now() - Date.parse(raw.started_at), 0));
      } else {
        setProgress(raw.progress_ms ?? 0);
      }
    };

    // Kuyruk artık liste sonuna kadar uzuyor: tek dolum yüzlerce satır yazıyor ve
    // Realtime her satır için ayrı olay yolluyor. Ham haliyle bu, yüzlerce tam
    // kuyruk sorgusu demekti — olaylar 250 ms'lik pencerede birleştirilir.
    const reloadQueue = () => {
      if (cancelled) return;
      if (queueReloadTimer) clearTimeout(queueReloadTimer);
      queueReloadTimer = setTimeout(() => {
        if (!cancelled) fetchQueue(venueDbId);
      }, 250);
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
        // Eski player sürümünde alan yok: yokluğu "akıyor" sayılır, yoksa çubuk
        // hiç ilerlemezdi.
        playbackStartedRef.current = beat.started !== false;
        // Şarkı değişti. Yeni şarkının satırı ZATEN ELİMİZDE: sıradaydı, şimdi
        // sahneye çıktı. Alt bar ve kuyruk panosu bu yüzden veritabanı turunu
        // beklemeden değişir — eskiden yalnızca "tazele" denip sunucudan
        // dönmesi bekleniyordu ve alt bar şarkıdan gözle görülür biçimde geç
        // kalıyordu (üstelik dönen satır çoğu kez henüz eski şarkıyı taşıyordu).
        if (current?.video_id != null && beat.video_id !== current.video_id) {
          const known = beat.video_id
            ? queueRef.current.find((q) => q.songs?.youtube_video_id === beat.video_id)
            : undefined;
          if (known?.songs && beat.video_id) {
            expectedVideoRef.current = { id: beat.video_id, at: Date.now() };
            setNowPlaying({
              ...current,
              video_id: beat.video_id,
              songs: known.songs,
              is_playing: beat.is_playing,
              progress_ms: beat.progress_ms,
              started_at: beat.is_playing
                ? new Date(Date.now() - beat.progress_ms).toISOString()
                : current.started_at,
              last_heartbeat_at: seenAt,
            });
            setProgress(beat.progress_ms);
            // Sahneye çıkan satır sıradan düşer; gerçeği fetchQueue doğrular
            setQueue((prev) => prev.filter((q) => q.id !== known.id));
          } else {
            setNowPlaying({ ...current, last_heartbeat_at: seenAt });
          }
          fetchNowPlaying();
          return;
        }
        // Sarma sürerken (ya da az önce bırakıldıysa) yoldaki değer bayattır
        if (!scrubIgnores()) setProgress(beat.progress_ms);
        setNowPlaying((prev) =>
          prev
            ? {
                ...prev,
                is_playing: beat.is_playing,
                progress_ms: scrubIgnores() ? prev.progress_ms : beat.progress_ms,
                // Sarmada çapa yerelde tazelendi; bayat çapayı geri yazmak
                // pencere kapanır kapanmaz çubuğu eski konuma sıçratırdı
                started_at:
                  beat.is_playing && !scrubIgnores()
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
      if (queueReloadTimer) clearTimeout(queueReloadTimer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [venueDbId, supabase, fetchQueue, scrubIgnores, setProgress]);

  // İlerleme tick'i. 250 ms: çubuk player'a takılmadan ilersin, saniye yazısı
  // gecikmeli görünmesin. Artık React state'i DEĞİL, ilerleme kutusu yazılıyor —
  // yani bu tick yalnızca sarma çubuğunu ve kuyruktaki mini çubuğu tazeler,
  // panelin geri kalanını değil.
  useEffect(() => {
    if (!nowPlaying) return;
    const interval = setInterval(() => {
      const tick = Date.now();
      // Player kapalıyken ilerlemeyi ilerletme: veri donmuş durumda ve saatten
      // hesaplanan çubuk "çalıyor" yalanı söyler (bkz. lib/player-status.ts).
      const beat = nowPlaying.last_heartbeat_at ? Date.parse(nowPlaying.last_heartbeat_at) : NaN;
      if (!Number.isFinite(beat) || tick - beat > OFFLINE_AFTER_MS) return;
      // Parmak çubuğun üstünde: imleci kullanıcı sürüyor, saat değil
      if (scrubbingRef.current) return;
      // Şarkı değişti ama ses henüz akmıyor (video tamponlanıyor): çubuk
      // beklemeli. Saymaya devam etseydi sesin önüne geçer, player ilk gerçek
      // konumu bildirdiğinde de geri sıçrardı.
      if (!playbackStartedRef.current) return;
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
  }, [nowPlaying, setProgress]);


  // Player sekmesi hiç açılmadıysa ya da heartbeat kesildiyse uyar. Tazelik
  // sorusu saniyede dört kez değil 5 sn'de bir sorulur ve yalnızca cevap
  // DEĞİŞTİĞİNDE render tetiklenir (uyarı bandı 45 sn'lik eşikle çalışıyor,
  // saniyelik keskinliğe ihtiyacı yok).
  useEffect(() => {
    const check = () => {
      const stamp = nowPlaying?.last_heartbeat_at;
      const beat = stamp ? Date.parse(stamp) : NaN;
      const offline = !Number.isFinite(beat) || Date.now() - beat > OFFLINE_AFTER_MS;
      setPlayerOffline((prev) => (prev === offline ? prev : offline));
    };
    check();
    const interval = setInterval(check, 5_000);
    return () => clearInterval(interval);
  }, [nowPlaying?.last_heartbeat_at]);

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
              started_at: playing
                ? new Date(Date.now() - progressRef.current).toISOString()
                : prev.started_at,
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
          expectedVideoRef.current = { id: upcoming.songs.youtube_video_id, at: Date.now() };
          playbackStartedRef.current = false;
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

  // --- Alt bardaki sarma çubuğu ---
  // Sürükleme boyunca YALNIZCA ekran güncellenir; komut parmak kalkınca tek
  // seferde gider. Her piksel için komut yollamak player'ı sürekli yeniden
  // tamponlatır ve sarma "hızlı" değil takırtılı hissettirirdi.
  const beginSeek = () => {
    scrubbingRef.current = true;
    seekGuardUntilRef.current = 0;
  };

  const previewSeek = (ms: number) => {
    scrubbingRef.current = true;
    setProgress(Math.max(0, Math.round(ms)));
  };

  const commitSeek = (ms: number) => {
    const max = nowPlaying?.songs?.duration_ms ?? 0;
    // Şarkının son kırıntısına sarmak çalmayı bitirip sıradakine geçirirdi;
    // 1 sn'lik pay bırakılır.
    const target = Math.max(0, Math.min(Math.round(ms), max > 0 ? max - 1_000 : Math.round(ms)));
    scrubbingRef.current = false;
    seekGuardUntilRef.current = Date.now() + SEEK_GUARD_MS;
    localActionAtRef.current = Date.now();
    setProgress(target);
    // Çapa yerelde kaydırılır: 250 ms'lik tick sunucuyu beklemeden yeni
    // konumdan saymaya devam eder, çubuk geri sıçramaz.
    setNowPlaying((prev) =>
      prev
        ? {
            ...prev,
            progress_ms: target,
            started_at: prev.is_playing
              ? new Date(Date.now() - target).toISOString()
              : prev.started_at,
          }
        : prev
    );
    // Tek hat: komut doğrudan player'a gider (~50-100 ms). Sunucuya ayrıca
    // yazmıyoruz — player yeni konumu kendi heartbeat'iyle zaten kalıcılaştırır
    // ve DB'ye "sarıldı" yazıp player'a ulaşmamak, çalan yerle satırı ayırırdı.
    sendCommand({ type: "seek", position_ms: target });
  };

  const cancelSeek = () => {
    scrubbingRef.current = false;
    seekGuardUntilRef.current = 0;
  };

  // Sahnedeki şarkıyı müşteri jetonuyla mı ekledi? Öyleyse kesilemez.
  const currentIsCustomer = playingRow?.user_id != null;

  // Sahneyi bu hook'un DIŞINDAN değiştiren akışlar için (playlist play tuşu:
  // /api/admin/playlists yanıtında video_id döner). Player DB → Realtime turunu
  // beklemeden videoyu yükler; alt bardaki şarkı bilgisi birazdan now_playing
  // aboneliğiyle gelir.
  const stageTakeover = (videoId: string, options?: { refreshQueue?: boolean }) => {
    localActionAtRef.current = Date.now();
    expectedVideoRef.current = { id: videoId, at: Date.now() };
    playbackStartedRef.current = false;
    setProgress(0);
    sendCommand({ type: "seeking" });
    sendCommand({ type: "load", video_id: videoId });
    // nowPlaying'e elle dokunulmaz: video_id'yi burada yazsaydık player'ın
    // yayınladığı yeni durum "değişmemiş" görünür ve alt bar eski şarkının
    // adını/kapağını taşımaya devam ederdi. Satır now_playing aboneliğiyle gelir.
    //
    // refreshQueue=false: sunucuya istek daha YOLA ÇIKMADAN sahne devralınıyor
    // (bkz. useLibrary.playNow). Kuyruk henüz değişmedi, boşuna çekilmesin —
    // yanıt gelince zaten tazelenecek.
    if (venueDbId && options?.refreshQueue !== false) void fetchQueue(venueDbId);
  };

  // "Şimdi çal": seçilen şarkı sahneye çıkar, çalan şarkı yarıda kesilir.
  // Sahnedeki şarkı müşterinin ise düğmeler zaten kapalı — sunucu da reddeder.
  //
  // song verilirse alt bar/kuyruk paneli sunucu turunu beklemeden yeni şarkıyı
  // gösterir; gerçek satır Realtime ile birazdan üzerine yazar.
  const playNow = async (
    target: { queue_id?: string; song_id?: string; playlist_id?: string | null },
    song?: QueueItem["songs"]
  ) => {
    if (!venueDbId) return { ok: false as const, error: "Mekan bulunamadı" };
    if (currentIsCustomer) {
      return { ok: false as const, error: "Müşterinin eklediği şarkı çalıyor — yarıda kesilemez" };
    }

    localActionAtRef.current = Date.now();
    sendCommand({ type: "seeking" });
    setProgress(0);
    // Sunucudan önce çalan videonun kimliği: geri dönmek gerekirse (istek
    // reddedilirse) player eski şarkısına döndürülür.
    const previousVideoId = nowPlayingRef.current?.video_id ?? null;
    if (song) {
      // HANGİ VİDEONUN ÇALACAĞINI ZATEN BİLİYORUZ: player'a şimdi söylenir,
      // sunucu turu beklenmez. Eskiden komut ancak yanıt döndükten sonra
      // gidiyordu ve şarkı gözle görülür biçimde geç başlıyordu.
      sendCommand({ type: "load", video_id: song.youtube_video_id });
      expectedVideoRef.current = { id: song.youtube_video_id, at: Date.now() };
      playbackStartedRef.current = false;
      setNowPlaying((prev) =>
        prev
          ? {
              ...prev,
              video_id: song.youtube_video_id,
              songs: song,
              is_playing: true,
              progress_ms: 0,
              started_at: new Date().toISOString(),
            }
          : prev
      );
      if (target.queue_id) setQueue((prev) => prev.filter((q) => q.id !== target.queue_id));
    }

    try {
      const res = await fetch("/api/admin/play-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        localActionAtRef.current = 0;
        // İyimser başlattığımız şarkı sunucuda kabul edilmedi: player eski
        // videosuna geri döner, yoksa panelde reddedilen şarkı çalmaya devam ederdi.
        if (song && previousVideoId && previousVideoId !== song.youtube_video_id) {
          sendCommand({ type: "load", video_id: previousVideoId });
        }
        await fetchQueue(venueDbId);
        return { ok: false as const, error: (data.error as string) ?? "Çalınamadı" };
      }
      // Sunucu başka bir videoda karar kıldıysa düzelt; aynıysa komut tekrarlanmaz
      if (typeof data.video_id === "string" && data.video_id !== song?.youtube_video_id) {
        sendCommand({ type: "load", video_id: data.video_id });
      }
      await fetchQueue(venueDbId);
      return { ok: true as const };
    } catch {
      localActionAtRef.current = 0;
      return { ok: false as const, error: "Bağlantı hatası" };
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

  // Fiilen çalınan liste: sahnedeki satırın kaynağı, o yoksa (müşteri şarkısı
  // çalıyorsa) kuyrukta bekleyen ilk playlist satırının kaynağı. Rotasyon imleci
  // bunun yerine geçemez — imleç "bir sonraki dolum nereden yapılacak"tır ve
  // kuyruk listenin sonuna kadar dolu olduğu için çalan listenin şarkıları hâlâ
  // sırada beklerken imleç çoktan sıradaki listeye kaymış olabilir.
  const playingListId = useMemo(() => {
    if (playingRow?.source_playlist_id) return playingRow.source_playlist_id;
    return queue.find((q) => q.source_playlist_id)?.source_playlist_id ?? null;
  }, [playingRow, queue]);

  // Liste başına kuyrukta BEKLEYEN şarkı sayısı. Kuyruk artık listenin sonuna
  // kadar dolduğu için "bu listeden kaç şarkı çaldı" ancak bununla bulunur:
  // tüketilen (kuyruğa yazılan) eksi hâlâ bekleyen (bkz. useLibrary.consumed).
  const pendingByList = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of queue) {
      if (!item.source_playlist_id || item.added_by !== "auto") continue;
      map[item.source_playlist_id] = (map[item.source_playlist_id] ?? 0) + 1;
    }
    return map;
  }, [queue]);

  // Elle sıraya eklenmiş satırlar: liste başına sayı (rayda "12 şarkı sırada")
  // ve toplam (kuyruktaki "Sırayı temizle" düğmesi).
  const manualByList = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of queue) {
      if (!isManualRow(item) || !item.source_playlist_id) continue;
      map[item.source_playlist_id] = (map[item.source_playlist_id] ?? 0) + 1;
    }
    return map;
  }, [queue]);

  const manualCount = useMemo(() => queue.filter(isManualRow).length, [queue]);

  // "Sırayı temizle": yalnızca elle eklenenler düşer. Çalan listenin şarkıları ve
  // müşterinin jetonla aldığı sıra olduğu gibi kalır.
  const clearManualQueue = async () => {
    setQueue((prev) => prev.filter((q) => !isManualRow(q)));
    const res = await fetch("/api/admin/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: "manual" }),
    });
    if (!res.ok && venueDbId) await fetchQueue(venueDbId);
  };

  const queuedVideoIds = useMemo(
    () => new Set(queue.map((q) => q.songs?.youtube_video_id).filter(Boolean)),
    [queue]
  );

  const duration = nowPlaying?.songs?.duration_ms ?? 1;

  return {
    queue,
    queuedVideoIds,
    playingListId,
    pendingByList,
    manualByList,
    manualCount,
    clearManualQueue,
    nowPlaying,
    // İlerleme sayısı bilerek burada YOK: abone olunabilir kutudan okunur
    // (bkz. useProgress), yoksa saniyede dört kez tüm panel yeniden çizilir.
    progressStore,
    duration,
    isPlaying: nowPlaying?.is_playing ?? false,
    playerOffline,
    playerLoading,
    volume,
    volumeError,
    queueError,
    reordering,
    playerAction,
    beginSeek,
    previewSeek,
    commitSeek,
    cancelSeek,
    changeVolume,
    toggleMute,
    removeFromQueue,
    moveWithinAuto,
    nudge,
    addToQueue,
    playNow,
    stageTakeover,
    currentIsCustomer,
    movableCount: queue.filter(isMovable).length,
  };
}

export type Playback = ReturnType<typeof usePlayback>;
