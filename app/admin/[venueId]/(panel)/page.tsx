"use client";

import { useState, useEffect, useMemo, useCallback, useRef, use, Suspense } from "react";
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
  user_id: string | null;
  added_by: string;
  tokens_spent: number;
  priority: boolean;
  position: number;
  added_at: string;
  songs: { youtube_video_id: string; title: string; artist: string; album_cover_url: string; duration_ms: number };
};

type NowPlaying = {
  is_playing: boolean;
  progress_ms: number;
  started_at: string | null;
  last_heartbeat_at: string | null;
  songs: { title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

type SearchTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
};

const QUEUE_SELECT =
  "id, user_id, added_by, tokens_spent, priority, position, added_at, songs(youtube_video_id, title, artist, album_cover_url, duration_ms)";

// Player 15 sn'de bir heartbeat yollar — bunun ~3 katı sessizlik "çevrimdışı" sayılır
const OFFLINE_AFTER_MS = 45_000;

// Müşterinin jetonla aldığı sıra taşınamaz; taşınabilen tek blok otomatik/elle
// eklenen şarkılardır (user_id null). Sunucu tarafı da aynı kuralı uygular.
const isMovable = (item: QueueItem) => item.user_id === null;

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

  const [queueError, setQueueError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = useMemo(() => createClient(), []);

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

      const reloadQueue = () => {
        if (!cancelled) fetchQueue(dbId);
      };

      fetchNowPlaying();
      reloadQueue();

      channels.push(
        supabase
          .channel(`admin-np:${dbId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${dbId}` }, fetchNowPlaying)
          .subscribe(),
        supabase
          .channel(`admin-queue:${dbId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${dbId}` }, reloadQueue)
          .subscribe()
      );
    };

    load();

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [venueId, supabase, fetchQueue]);

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

  const doSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Arama başarısız");
        return;
      }
      setSearchResults(data.tracks ?? []);
    } catch {
      setSearchError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(value), 350);
  };

  const addToQueue = async (track: SearchTrack) => {
    setAddingId(track.youtube_video_id);
    setSearchError("");
    try {
      const res = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(track),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSearchError(data.error ?? "Eklenemedi");
        return;
      }
      if (venueDbId) await fetchQueue(venueDbId);
    } catch {
      setSearchError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setAddingId(null);
    }
  };

  const closeAddModal = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowAddModal(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
  };

  const queuedVideoIds = useMemo(
    () => new Set(queue.map((q) => q.songs?.youtube_video_id).filter(Boolean)),
    [queue]
  );

  const movableCount = queue.filter(isMovable).length;

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
          {/* Adlandırılmış pencere: tekrar tıklamak yeni sekme açmaz, aynı player'a döner */}
          <a
            href={`/admin/${venueId}/player`}
            target={`pmj-player-${venueId}`}
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
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm">Kuyruk</p>
            <p className="text-[#6b7280] text-xs mt-0.5">{queue.length} şarkı · {movableCount} tanesi taşınabilir</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0"
            style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Sıraya Şarkı Ekle
          </button>
        </div>

        <div className="px-5 py-2 border-b border-white/10 flex items-center gap-4 flex-wrap text-[#6b7280] text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#e91e8c" }} /> Öncelikli (jeton)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#8b5cf6" }} /> Normal (jeton)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(255,255,255,0.15)" }} /> Otomatik / mekan
          </span>
        </div>

        {queueError && (
          <div className="px-5 py-2.5 text-xs" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>
            {queueError}
          </div>
        )}

        {queue.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#6b7280] text-sm">Kuyruk boş</div>
        ) : (
          <div>
            {queue.map((item, i) => {
              const movable = isMovable(item);
              const movableIndex = movable ? queue.filter(isMovable).findIndex((q) => q.id === item.id) : -1;
              const isAdminAdded = movable && item.added_by === "admin";
              // Jetonla eklenenler renkle ayrışsın: öncelikli = pembe, normal = mor,
              // otomatik/mekan = renksiz.
              const accent = item.tokens_spent > 0 ? (item.priority ? "#e91e8c" : "#8b5cf6") : null;
              const accentBg = item.tokens_spent > 0
                ? item.priority
                  ? "rgba(233,30,140,0.08)"
                  : "rgba(139,92,246,0.08)"
                : undefined;

              return (
                <div
                  key={item.id}
                  draggable={movable && !reordering}
                  onDragStart={() => movable && setDragId(item.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    // Müşteri satırlarının üstüne bırakmaya izin verme
                    if (movable && dragId && dragId !== item.id) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (movable && dragId) moveWithinAuto(dragId, item.id);
                    setDragId(null);
                  }}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                  style={{
                    borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                    borderLeft: accent ? `3px solid ${accent}` : "3px solid transparent",
                    background: accentBg,
                    opacity: dragId === item.id ? 0.4 : 1,
                    cursor: movable && !reordering ? "grab" : "default",
                  }}
                >
                  <span className="text-[#6b7280] text-xs w-5 shrink-0">{i + 1}</span>

                  {movable ? (
                    <span className="text-[#6b7280] shrink-0 hidden md:block" title="Sürükleyerek taşı">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
                    </span>
                  ) : (
                    <span className="text-[#6b7280] shrink-0 hidden md:block" title="Jetonla alınan sıra — taşınamaz">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </span>
                  )}

                  {item.songs.album_cover_url ? (
                    <Image src={item.songs.album_cover_url} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/10 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.songs.title}</p>
                    <p className="text-[#6b7280] text-xs truncate">
                      {item.songs.artist} ·{" "}
                      {movable
                        ? isAdminAdded
                          ? "mekan ekledi"
                          : "otomatik"
                        : <>{item.added_by} · <span style={{ color: accent ?? undefined, fontWeight: 600 }}>{item.tokens_spent} jeton</span></>}
                    </p>
                  </div>

                  {item.tokens_spent > 0 && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                      style={
                        item.priority
                          ? { background: "rgba(233,30,140,0.15)", color: "#e91e8c" }
                          : { background: "rgba(139,92,246,0.15)", color: "#a78bfa" }
                      }
                    >
                      {item.priority ? "Önce" : "Jeton"}
                    </span>
                  )}

                  {movable && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => nudge(item.id, -1)}
                        disabled={reordering || movableIndex <= 0}
                        title="Yukarı taşı"
                        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-white/10 disabled:opacity-25"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <button
                        onClick={() => nudge(item.id, 1)}
                        disabled={reordering || movableIndex < 0 || movableIndex >= movableCount - 1}
                        title="Aşağı taşı"
                        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-white/10 disabled:opacity-25"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                  )}

                  <button onClick={() => removeFromQueue(item.id)} className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-all hover:bg-red-500/20" style={{ background: "rgba(239,68,68,0.1)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {movableCount > 0 && (
          <div className="px-5 py-2.5 border-t border-white/10 text-[#6b7280] text-xs">
            Yalnızca otomatik ve mekanın eklediği şarkılar taşınabilir. Müşterilerin jetonla aldığı sıra değiştirilemez.
          </div>
        )}
      </div>

      {/* Sıraya şarkı ekle */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="absolute inset-0 bg-black/70" onClick={closeAddModal} />
          <div
            className="relative w-full md:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl md:rounded-2xl border border-white/10"
            style={{ background: "#150e21" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <p className="text-white font-semibold text-sm">Sıraya Şarkı Ekle</p>
                <p className="text-[#6b7280] text-xs mt-0.5">Otomatik çalanların arasına girer, jeton harcanmaz</p>
              </div>
              <button onClick={closeAddModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="px-5 py-4 border-b border-white/10">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Şarkı veya sanatçı ara..."
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              {searchError && <p className="text-xs mt-2" style={{ color: "#f87171" }}>{searchError}</p>}
            </div>

            <div className="flex-1 overflow-y-auto">
              {searching ? (
                <p className="px-5 py-8 text-center text-[#6b7280] text-sm">Aranıyor...</p>
              ) : searchResults.length === 0 ? (
                <p className="px-5 py-8 text-center text-[#6b7280] text-sm">
                  {searchQuery.trim() ? "Sonuç bulunamadı" : "Aramak için yazmaya başlayın"}
                </p>
              ) : (
                searchResults.map((track, i) => {
                  const already = queuedVideoIds.has(track.youtube_video_id);
                  return (
                    <div
                      key={track.youtube_video_id}
                      className="flex items-center gap-3 px-5 py-3"
                      style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}
                    >
                      {track.album_cover_url ? (
                        <Image src={track.album_cover_url} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white/10 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{track.title}</p>
                        <p className="text-[#6b7280] text-xs truncate">
                          {track.artist}
                          {track.duration_ms > 0 && ` · ${formatTime(track.duration_ms)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => addToQueue(track)}
                        disabled={already || addingId === track.youtube_video_id}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-40"
                        style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
                      >
                        {already ? "Sırada" : addingId === track.youtube_video_id ? "..." : "Ekle"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
