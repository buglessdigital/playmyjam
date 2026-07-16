"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import AddSongSheet from "@/components/browse/AddSongSheet";
import LyricsOverlay from "@/components/song/LyricsOverlay";
import type { TrackDetails } from "@/lib/youtube";
import type { LyricsResult } from "@/lib/lyrics";

type QueueEntry = { song_id: string; priority: boolean; duration_ms: number };
type NowPlayingInfo = { songId: string | null; progress_ms: number; is_playing: boolean; duration_ms: number };

// Aşağı kaydırınca görünen sıra bölümü için şarkı bilgili kuyruk (get_queue_state RPC'si)
type SongMeta = { title: string; artist: string; album_cover_url: string; duration_ms: number };
type FullQueueItem = { id: string; song_id: string; priority: boolean; position: number; songs: SongMeta };
type FullNowPlaying = { song_id: string | null; is_playing: boolean; songs: SongMeta | null };
type QueueState = { now_playing: FullNowPlaying | null; queue: FullQueueItem[] };

type SongUserState = {
  db_song_id: string | null;
  play_count: number;
  in_venue_list: boolean;
  is_favorite: boolean;
  token_balance: number;
  recently_played_at: number | null;
  queue_entries: QueueEntry[];
  now_playing: { song_id: string | null; progress_ms: number; is_playing: boolean; duration_ms: number } | null;
};

const COOLDOWN_MS = 30 * 60 * 1000;

// Player durumu sunucuya, oradan da bize gelene kadar geçen boru hattı gecikmesinin
// telafisi — satır vurgusu geç kalmaktansa bir tık erken yansın
const LYRICS_LEAD_MS = 400;

type Cooldown = { remainingMs: number; reason: "played" | "queued" | null };

// Şarkı kuyruktaysa veya son 30 dk'da çalındıysa cooldown — veri geldiği anda hesaplanır
function computeCooldown(dbSongId: string | null, entries: QueueEntry[], recentlyPlayedAt: number | null): Cooldown {
  if (dbSongId && entries.some((e) => e.song_id === dbSongId)) {
    return { remainingMs: COOLDOWN_MS, reason: "queued" };
  }
  if (recentlyPlayedAt) {
    const remaining = recentlyPlayedAt + COOLDOWN_MS - Date.now();
    if (remaining > 0) return { remainingMs: remaining, reason: "played" };
  }
  return { remainingMs: 0, reason: null };
}

interface Props {
  venueId: string;
  venueDbId: string;
  track: TrackDetails | null;
  requestCost: number;
  priorityCost: number;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatReleaseDate(date: string | null): string {
  if (!date) return "";
  const parts = date.split("-");
  return parts[0] ?? date;
}

function formatWait(ms: number): string {
  if (ms <= 0) return "Hemen";
  const mins = Math.ceil(ms / 60000);
  return `~${mins} dk`;
}

export default function SongDetailClient({ venueId, venueDbId, track, requestCost, priorityCost }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loaded, setLoaded] = useState(false);
  const [dbSongId, setDbSongId] = useState<string | null>(null);
  const [playCount, setPlayCount] = useState(0);
  const [inVenueList, setInVenueList] = useState(false);
  const [cooldown, setCooldown] = useState<Cooldown>({ remainingMs: 0, reason: null });
  const [isFavorite, setIsFavorite] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [added, setAdded] = useState(false);
  const [requested, setRequested] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  // track prop'u mount sonrası değişmez — loading'i initializer'da başlatmak
  // effect içinde senkron setState gereksinimini kaldırıyor
  const [lyricsLoading, setLyricsLoading] = useState(!!track);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [fullQueue, setFullQueue] = useState<FullQueueItem[]>([]);
  const [npDetail, setNpDetail] = useState<FullNowPlaying | null>(null);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [trackIdBySongId, setTrackIdBySongId] = useState<Map<string, string>>(new Map());
  const queueSectionRef = useRef<HTMLDivElement | null>(null);

  // Sözler butona basılınca anında gözüksün diye sayfa açılır açılmaz arka planda önceden çekiliyor
  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    const params = new URLSearchParams({
      trackId: track.youtube_video_id,
      title: track.title,
      artist: track.artist,
      durationMs: String(track.duration_ms),
    });
    fetch(`/api/lyrics?${params}`)
      .then((res) => res.json())
      .then((data: { lyrics: LyricsResult | null }) => {
        if (!cancelled) setLyrics(data.lyrics);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [track]);

  // venueDbId yokken (mekan bulunamadı) abone olunacak bir şey yok
  useEffect(() => {
    if (!venueDbId || !track) return;
    let cancelled = false;

    // Kullanıcı + canlı durum tek round-trip (0006'daki RPC): db şarkı kaydı, favori,
    // bakiye, cooldown, kuyruk süreleri ve şu an çalan
    const fetchState = async () => {
      // started_at RPC'de yok ama sözlerin gerçek zamanlı senkronu için şart:
      // DB'deki progress_ms yazıldığı andan itibaren bayatlıyor, started_at ise sabit çapa
      const [{ data }, { data: npRow }, { data: queueData }] = await Promise.all([
        supabase.rpc("get_song_user_state", {
          p_venue_id: venueDbId,
          p_youtube_video_id: track.youtube_video_id,
        }),
        supabase
          .from("now_playing")
          .select("started_at, is_playing")
          .eq("venue_id", venueDbId)
          .maybeSingle(),
        supabase.rpc("get_queue_state", { p_venue_id: venueDbId }),
      ]);
      if (cancelled) return;

      // Sıra bölümü kullanıcı-durumu RPC'sinden bağımsız — o başarısız olsa da sıra görünsün
      const qs = queueData as unknown as QueueState | null;
      setFullQueue(qs?.queue ?? []);
      setNpDetail(qs?.now_playing ?? null);
      setQueueLoaded(true);

      if (!data) return;
      const state = data as unknown as SongUserState;

      const np2 = npRow as { started_at: string | null; is_playing: boolean } | null;
      setStartedAtMs(np2?.is_playing && np2.started_at ? Date.parse(np2.started_at) : null);

      setDbSongId(state.db_song_id);
      setPlayCount(state.play_count ?? 0);
      setInVenueList(state.in_venue_list ?? false);
      setIsFavorite(state.is_favorite ?? false);
      setTokenBalance(state.token_balance ?? 0);
      setQueueEntries(state.queue_entries ?? []);
      setCooldown(computeCooldown(state.db_song_id, state.queue_entries ?? [], state.recently_played_at));

      const np = state.now_playing;
      if (np && np.duration_ms > 0) {
        setNowPlaying({ songId: np.song_id, progress_ms: np.progress_ms ?? 0, is_playing: np.is_playing, duration_ms: np.duration_ms });
        // İlk boyamada da çapadan hesapla — RPC'deki progress_ms yazıldığından beri bayat
        const anchored =
          np.is_playing && np2?.is_playing && np2.started_at
            ? Math.min(Math.max(Date.now() - Date.parse(np2.started_at), 0), np.duration_ms)
            : np.progress_ms ?? 0;
        setProgress(anchored);
      } else {
        setNowPlaying(null);
        setProgress(0);
      }
      setLoaded(true);
    };

    fetchState();

    const queueChannel = supabase
      .channel(`song-queue:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueDbId}` }, fetchState)
      .subscribe();

    const npChannel = supabase
      .channel(`song-now-playing:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` }, fetchState)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(queueChannel);
      supabase.removeChannel(npChannel);
    };
  }, [venueDbId, track, supabase]);

  // get_queue_state RPC'si youtube_video_id döndürmüyor — sıradaki bir şarkıya
  // dokununca detayına gidebilmek için eksik id'leri tek sorguda songs tablosundan eşle
  useEffect(() => {
    const ids = new Set<string>();
    if (npDetail?.song_id) ids.add(npDetail.song_id);
    fullQueue.forEach((q) => ids.add(q.song_id));
    const missing = [...ids].filter((id) => !trackIdBySongId.has(id));
    if (missing.length === 0) return;
    let cancelled = false;

    supabase
      .from("songs")
      .select("id, youtube_video_id")
      .in("id", missing)
      .then(({ data }: { data: { id: string; youtube_video_id: string }[] | null }) => {
        if (cancelled || !data) return;
        setTrackIdBySongId((prev) => {
          const next = new Map(prev);
          data.forEach((row) => next.set(row.id, row.youtube_video_id));
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fullQueue, npDetail, trackIdBySongId, supabase]);

  // İlerlemeyi duvar saatine sabitle: started_at varsa gerçek konum her tick'te
  // Date.now() - started_at ile hesaplanır (interval sürüklenmesi ve bayat progress_ms
  // sorunu olmaz); yoksa eski davranışa düş
  useEffect(() => {
    if (!nowPlaying?.is_playing) return;
    const dur = nowPlaying.duration_ms;
    const tick = () => {
      if (startedAtMs) {
        setProgress(Math.min(Math.max(Date.now() - startedAtMs, 0), dur));
      } else {
        setProgress((p) => Math.min(p + 500, dur));
      }
    };
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [nowPlaying, startedAtMs]);

  const remainingCurrentMs = nowPlaying ? Math.max(nowPlaying.duration_ms - progress, 0) : 0;
  const waitNormalMs = useMemo(
    () => remainingCurrentMs + queueEntries.reduce((sum, e) => sum + e.duration_ms, 0),
    [queueEntries, remainingCurrentMs]
  );
  const waitPriorityMs = useMemo(
    () => remainingCurrentMs + queueEntries.filter((e) => e.priority).reduce((sum, e) => sum + e.duration_ms, 0),
    [queueEntries, remainingCurrentMs]
  );

  const isCurrentlyPlayingThisSong = !!dbSongId && nowPlaying?.songId === dbSongId && nowPlaying.is_playing;

  // Sıra bölümü: kuyruk dizisi zaten çalma sırasında (priority, position);
  // idx'ten önceki tüm şarkılar bu şarkıdan önce çalar
  const getQueueWaitMinutes = (idx: number) => {
    const queueMs = fullQueue.slice(0, idx).reduce((sum, e) => sum + (e.songs?.duration_ms ?? 0), 0);
    return Math.ceil((remainingCurrentMs + queueMs) / 60000);
  };

  const openQueueSong = (songId: string | null) => {
    if (!songId || songId === dbSongId) return;
    const trackId = trackIdBySongId.get(songId);
    if (trackId) router.push(`/venue/${venueId}/song/${trackId}`);
  };

  // Bölüm veri gelir gelmez her zaman görünür — kuyruk boşken de boş durum mesajı gösterilir
  const hasQueueSection = queueLoaded;

  const activeLyricsIndex = useMemo(() => {
    if (!lyrics?.synced || !isCurrentlyPlayingThisSong) return -1;
    const syncedProgress = progress + LYRICS_LEAD_MS;
    let idx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].timeMs <= syncedProgress) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, isCurrentlyPlayingThisSong, progress]);

  if (!track) {
    return (
      <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 16 }}>Şarkı bulunamadı</p>
        <button
          onClick={() => router.back()}
          style={{ padding: "10px 20px", borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 14, cursor: "pointer" }}
        >
          Geri Dön
        </button>
      </div>
    );
  }

  const toggleFavorite = async () => {
    if (!dbSongId) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;

    if (isFavorite) {
      setIsFavorite(false);
      await supabase.from("user_favorites").delete().eq("user_id", userId).eq("song_id", dbSongId);
    } else {
      setIsFavorite(true);
      await supabase.from("user_favorites").insert({ user_id: userId, song_id: dbSongId });
    }
  };

  const handleAdd = async (priority: boolean) => {
    if (!dbSongId || !venueDbId) return;
    // Optimistic düşüm — gerçek düşüm RPC'de venues.request_cost/priority_cost'tan
    const cost = priority ? priorityCost : requestCost;
    setTokenBalance((b) => b - cost);
    setAdded(true);
    setSheetOpen(false);

    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue_id: venueDbId, song_id: dbSongId, priority }),
    });

    if (!res.ok) {
      setTokenBalance((b) => b + cost);
      setAdded(false);
    }
  };

  const handleRequest = async () => {
    if (!venueDbId) return;
    setRequested(true);
    await fetch(`/api/venue/${venueId}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtube_video_id: track.youtube_video_id,
        title: track.title,
        artist: track.artist,
        album_cover_url: track.album_cover_url,
        duration_ms: track.duration_ms,
      }),
    });
  };

  const isOnCooldown = cooldown.remainingMs > 0;
  const cooldownMins = Math.ceil(cooldown.remainingMs / 60000);

  // Ana eylem butonu (ortadaki büyük "play" pozisyonu): durum makinesi
  let centerIcon: ReactNode;
  let centerDisabled = false;
  let centerAction: () => void = () => {};
  let centerBg = "white";

  if (!loaded) {
    // Kullanıcı durumu henüz gelmedi (~100-150 ms) — yanlış durum göstermemek için nötr
    centerDisabled = true;
    centerBg = "rgba(255,255,255,0.1)";
    centerIcon = <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" /></svg>;
  } else if (!dbSongId) {
    centerDisabled = true;
    centerIcon = <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" /></svg>;
  } else if (inVenueList) {
    if (isOnCooldown) {
      centerDisabled = true;
      centerBg = "rgba(255,255,255,0.1)";
      centerIcon = <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#6b7280" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>;
    } else if (added) {
      centerBg = "rgba(233,30,140,0.9)";
      centerIcon = <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
      centerDisabled = true;
    } else {
      centerAction = () => setSheetOpen(true);
      centerIcon = <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#0f0a18" strokeWidth="3" strokeLinecap="round" /></svg>;
    }
  } else {
    if (requested) {
      centerDisabled = true;
      centerBg = "rgba(251,191,36,0.25)";
      centerIcon = <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    } else {
      centerBg = "#fbbf24";
      centerAction = handleRequest;
      centerIcon = <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#0f0a18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    }
  }

  const centerCaption = !loaded
    ? ""
    : !dbSongId
    ? "Mekan listesinde değil"
    : isOnCooldown
    ? `${cooldownMins} dk sonra eklenebilir`
    : inVenueList
    ? added
      ? "Sıraya eklendi"
      : "Sıraya ekle"
    : requested
    ? "İstendi"
    : "Mekana istek gönder";

  const progressPct = isOnCooldown ? Math.min(100, Math.max(0, 100 - (cooldown.remainingMs / (30 * 60 * 1000)) * 100)) : 0;

  return (
    <div style={{ width: "100%", background: "#0f0a18" }}>
      {/* İlk ekran: mevcut şarkı detayı — tam viewport yüksekliğinde, sıra bölümü altında kalır */}
      <div
        style={{
          minHeight: "100dvh",
          width: "100%",
          background: "linear-gradient(180deg, #2a1a30 0%, #150c1f 38%, #0f0a18 100%)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Üst bar */}
        <div style={{ padding: "20px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {dbSongId && (
              <button onClick={toggleFavorite} style={{ width: 38, height: 38, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "#e91e8c" : "none"}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke={isFavorite ? "#e91e8c" : "white"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            {track.external_url && (
              <a
                href={track.external_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
            )}
          </div>
        </div>

        {/* Albüm kapağı */}
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 28px 0" }}>
          <div style={{ width: "100%", maxWidth: 340, aspectRatio: "1 / 1", borderRadius: 18, overflow: "hidden", background: "#1a0e2a", boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}>
            {track.album_cover_url && (
              <Image src={track.album_cover_url} alt={track.title} width={340} height={340} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </div>
        </div>

        {/* Başlık + sanatçı */}
        <div style={{ padding: "24px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h1 style={{ color: "white", fontWeight: 700, fontSize: 21, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</h1>
            {track.external_url && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </div>
          <p style={{ color: "#9ca3af", fontSize: 15, margin: "4px 0 0" }}>{track.artist}</p>

          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 18 }}>
            <div>
              <p style={{ color: "white", fontSize: 13, fontWeight: 700, margin: 0 }}>{formatWait(waitNormalMs)}</p>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0" }}>Normal sıra bekleme</p>
            </div>
            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)" }} />
            <div>
              <p style={{ color: "#e91e8c", fontSize: 13, fontWeight: 700, margin: 0 }}>{formatWait(waitPriorityMs)}</p>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0" }}>Öncelikli sıra bekleme</p>
            </div>
          </div>
        </div>

        {/* Bilgi pilleri */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 24px 0", flexWrap: "wrap" }}>
          <button
            onClick={() => setLyricsOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13M9 9l12-2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ color: "white", fontSize: 13, fontWeight: 600 }}>Sözler</span>
          </button>
          {dbSongId && (
            <button
              onClick={toggleFavorite}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? "#e91e8c" : "none"}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke={isFavorite ? "#e91e8c" : "white"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ color: "white", fontSize: 13, fontWeight: 600 }}>{isFavorite ? "Favoride" : "Favorile"}</span>
            </button>
          )}
          {playCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, background: "rgba(233,30,140,0.12)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="#e91e8c" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#e91e8c" strokeWidth="2" /></svg>
              <span style={{ color: "#e91e8c", fontSize: 13, fontWeight: 600 }}>{playCount} kez çalındı</span>
            </span>
          )}
          {track.release_date && (
            <span style={{ padding: "8px 14px", borderRadius: 20, background: "rgba(255,255,255,0.08)", color: "#d1d5db", fontSize: 13, fontWeight: 600 }}>
              {formatReleaseDate(track.release_date)}
            </span>
          )}
        </div>

        {/* İlerleme çubuğu (kuyruk bekleme süresi gösterimi) */}
        <div style={{ padding: "28px 24px 0" }}>
          <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progressPct}%`, background: "#e91e8c", borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ color: "#6b7280", fontSize: 11 }}>{isOnCooldown ? "Bekleme" : "0:00"}</span>
            <span style={{ color: "#6b7280", fontSize: 11 }}>{isOnCooldown ? `${cooldownMins} dk` : formatDuration(track.duration_ms)}</span>
          </div>
        </div>

        {/* Kontrol satırı */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, padding: "20px 24px 0" }}>
          <button
            onClick={() => !centerDisabled && centerAction()}
            disabled={centerDisabled}
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: centerBg,
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: centerDisabled ? "default" : "pointer",
              boxShadow: centerDisabled ? "none" : "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {centerIcon}
          </button>
        </div>

        <p style={{ textAlign: "center", color: centerDisabled && !isOnCooldown ? "#6b7280" : isOnCooldown ? "#6b7280" : "#9ca3af", fontSize: 13, fontWeight: 600, marginTop: 12 }}>
          {centerCaption}
        </p>

        {/* Aşağıda sıra varsa kaydırma ipucu — dokununca sıra bölümüne kayar */}
        <div style={{ marginTop: "auto", paddingTop: 20, paddingBottom: 10, display: "flex", justifyContent: "center", minHeight: 58 }}>
          {hasQueueSection && (
            <button
              onClick={() => queueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, background: "none", border: "none", cursor: "pointer", padding: 6 }}
            >
              <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600 }}>Sıra</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Sıra bölümü: aşağı kaydırınca görünür — şu an çalan + sıradaki şarkılar */}
      {hasQueueSection && (
        <div ref={queueSectionRef} style={{ padding: "20px 20px 40px", scrollMarginTop: 8 }}>
          <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>Şuradan çalınıyor</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 14px" }}>
            <h3 style={{ color: "white", fontSize: 17, fontWeight: 700, margin: 0 }}>Mekan Sırası</h3>
            {fullQueue.length > 0 && <span style={{ color: "#9ca3af", fontSize: 12 }}>Kuyrukta {fullQueue.length} şarkı</span>}
          </div>

          {/* Şu an çalan — listenin başında vurgulu satır; yoksa sessiz durum */}
          {!npDetail?.songs && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, marginBottom: 8, background: "#1a0e2a" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="1.8" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="1.8" /></svg>
              </div>
              <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Şu an çalan yok</p>
            </div>
          )}
          {npDetail?.songs && (
            <div
              onClick={() => openQueueSong(npDetail.song_id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 16,
                marginBottom: 8,
                background: "rgba(233,30,140,0.10)",
                border: "1px solid rgba(233,30,140,0.25)",
                cursor: npDetail.song_id && npDetail.song_id !== dbSongId ? "pointer" : "default",
              }}
            >
              <div style={{ position: "relative", width: 48, height: 48, borderRadius: 12, overflow: "hidden", background: "#0f0a18", flexShrink: 0 }}>
                {npDetail.songs.album_cover_url && (
                  <Image src={npDetail.songs.album_cover_url} alt={npDetail.songs.title} width={48} height={48} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                {npDetail.is_playing && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    {[3, 5, 4].map((h, i) => (
                      <span key={i} style={{ width: 3, height: h * 4, borderRadius: 2, background: "#e91e8c", animation: `sq-eq ${0.5 + i * 0.15}s ease-in-out infinite alternate`, display: "inline-block" }} />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "white", fontWeight: 600, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{npDetail.songs.title}</p>
                <p style={{ color: "#9ca3af", fontSize: 12, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{npDetail.songs.artist}</p>
              </div>
              <span style={{ color: "#e91e8c", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{npDetail.is_playing ? "ÇALIYOR" : "DURAKLADI"}</span>
            </div>
          )}

          {/* Sıradaki şarkılar — sıra numarası + bekleme süresi; bu sayfanın şarkısı vurgulanır */}
          {fullQueue.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: "20px 0", margin: 0 }}>Kuyruk boş — ilk şarkıyı sen ekle!</p>
          ) : (
            fullQueue.map((item, idx) => {
              const isThisSong = !!dbSongId && item.song_id === dbSongId;
              return (
                <div
                  key={item.id}
                  onClick={() => openQueueSong(item.song_id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 12,
                    borderRadius: 16,
                    marginBottom: 8,
                    background: isThisSong ? "rgba(233,30,140,0.10)" : "#1a0e2a",
                    border: isThisSong ? "1px solid rgba(233,30,140,0.35)" : "1px solid transparent",
                    cursor: isThisSong ? "default" : "pointer",
                  }}
                >
                  <span style={{ width: 18, textAlign: "center", color: isThisSong ? "#e91e8c" : "#6b7280", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", background: "#0f0a18", flexShrink: 0 }}>
                    {item.songs.album_cover_url && (
                      <Image src={item.songs.album_cover_url} alt={item.songs.title} width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "white", fontWeight: 600, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.songs.title}</p>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.songs.artist}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {isThisSong && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>Bu şarkı</span>
                    )}
                    {item.priority && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>Önce</span>
                    )}
                    <span style={{ color: item.priority ? "#e91e8c" : "#9ca3af", fontSize: 12, fontWeight: 700 }}>~{getQueueWaitMinutes(idx)} dk</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Şarkı sözleri — tam ekran overlay, dokununca anında açılır */}
      {lyricsOpen && (
        <LyricsOverlay
          title={track.title}
          artist={track.artist}
          lyrics={lyrics}
          loading={lyricsLoading}
          activeIndex={activeLyricsIndex}
          onClose={() => setLyricsOpen(false)}
        />
      )}

      <AddSongSheet
        song={sheetOpen ? { youtube_video_id: track.youtube_video_id, title: track.title, artist: track.artist, album_cover_url: track.album_cover_url } : null}
        tokenBalance={tokenBalance}
        cooldown={cooldown}
        waitNormalMs={waitNormalMs}
        waitPriorityMs={waitPriorityMs}
        normalCost={requestCost}
        priorityCost={priorityCost}
        onClose={() => setSheetOpen(false)}
        onAdd={handleAdd}
      />

      <style jsx>{`
        @keyframes sq-eq { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }
      `}</style>
    </div>
  );
}
