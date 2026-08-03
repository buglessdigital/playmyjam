"use client";

import { useState, useEffect, useMemo, use, Suspense } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import YouTubePlayer from "@/components/player/YouTubePlayer";
import { formatWait, useNowPlayingClock } from "@/lib/wait-time";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Song = { title: string; artist: string; album_cover_url: string; duration_ms: number };

type NowPlaying = {
  is_playing: boolean;
  progress_ms: number;
  started_at: string | null;
  songs: Song | null;
};

type QueueItem = {
  id: string;
  priority: boolean;
  songs: Song | null;
};

const QUEUE_SELECT = "id, priority, songs(title, artist, album_cover_url, duration_ms)";
// Müşteri kuyruk ekranıyla aynı: sıradaki 10 şarkı
const QUEUE_LIMIT = 10;

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Mekanın TV/ekrana bağlı cihazında tam ekran açılır: video + sıradakiler.
// Video alanının üstüne hiçbir şey bindirilmez (YouTube API kuralı).
export default function PlayerPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PlayerPageContent params={params} />
    </Suspense>
  );
}

function PlayerPageContent({ params }: Props) {
  const { venueId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [venueDbId, setVenueDbId] = useState("");
  const [venueName, setVenueName] = useState("");
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const load = async () => {
      const { data: venue } = await supabase
        .from("venues")
        .select("id, name")
        .eq("slug", venueId)
        .single();
      if (cancelled || !venue) return;
      setVenueDbId(venue.id);
      setVenueName(venue.name);

      const fetchCurrent = async () => {
        const { data } = await supabase
          .from("now_playing")
          .select("is_playing, progress_ms, started_at, songs(title, artist, album_cover_url, duration_ms)")
          .eq("venue_id", venue.id)
          .maybeSingle();
        if (cancelled) return;
        if (!data) {
          setNowPlaying(null);
          return;
        }
        const raw = data as unknown as Omit<NowPlaying, "songs"> & { songs: Song | Song[] | null };
        const songs = Array.isArray(raw.songs) ? raw.songs[0] ?? null : raw.songs;
        setNowPlaying({ ...raw, songs });
      };

      const fetchQueue = async () => {
        const { data, count } = await supabase
          .from("queue")
          .select(QUEUE_SELECT, { count: "exact" })
          .eq("venue_id", venue.id)
          .eq("status", "queued")
          .order("priority", { ascending: false })
          .order("position", { ascending: true })
          .limit(QUEUE_LIMIT);
        if (cancelled) return;
        if (data) setQueue(data as unknown as QueueItem[]);
        setQueueTotal(count ?? 0);
        setLoaded(true);
      };

      fetchCurrent();
      fetchQueue();

      channels.push(
        supabase
          .channel(`player-page-np:${venue.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venue.id}` }, fetchCurrent)
          .subscribe(),
        supabase
          .channel(`player-page-queue:${venue.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venue.id}` }, fetchQueue)
          .subscribe()
      );
    };
    load();

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [venueId, supabase]);

  const npClock = useMemo(
    () =>
      nowPlaying?.songs
        ? {
            duration_ms: nowPlaying.songs.duration_ms,
            progress_ms: nowPlaying.progress_ms,
            is_playing: nowPlaying.is_playing,
            started_at: nowPlaying.started_at,
          }
        : null,
    [nowPlaying]
  );
  const { progressMs, remainingMs } = useNowPlayingClock(npClock);

  const durationMs = nowPlaying?.songs?.duration_ms ?? 0;
  const progressPct = durationMs > 0 ? Math.min((progressMs / durationMs) * 100, 100) : 0;
  const isPlaying = !!nowPlaying?.is_playing && !!nowPlaying?.songs;

  // Kuyruk zaten çalma sırasında (priority, position); idx'ten öncekiler bu şarkıdan önce çalar
  const getRowWaitMs = (idx: number) =>
    remainingMs + queue.slice(0, idx).reduce((sum, e) => sum + (e.songs?.duration_ms ?? 0), 0);

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#0f0a18] p-4 md:p-6 lg:h-dvh lg:overflow-hidden">
      {/* Arka plan ışıması — TV'de derinlik verir, içeriğin altında kalır */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 500px at 15% -10%, rgba(233,30,140,0.18), transparent 70%), radial-gradient(800px 500px at 100% 110%, rgba(139,92,246,0.16), transparent 70%)",
        }}
      />

      <header className="relative z-10 mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/logo-mark.png" alt="Play My Jam" width={454} height={512} className="h-9 w-9 shrink-0 object-contain md:h-10 md:w-10" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">Play My Jam</p>
            <h1 className="truncate text-lg font-bold text-white md:text-xl">{venueName || venueId}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isPlaying && (
            <span
              className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold sm:flex"
              style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c", border: "1px solid rgba(233,30,140,0.25)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#e91e8c]" style={{ animation: "live-dot 1.4s ease-in-out infinite" }} />
              CANLI
            </span>
          )}
          <a
            href={`/admin/${venueId}`}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-[#9ca3af] transition-colors hover:border-white/20 hover:text-white"
          >
            Panele Dön
          </a>
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)] lg:gap-6">
        {/* Sol sütun: video + altında çalan şarkı bilgisi (video üstüne bindirme YOK) */}
        <div className="flex min-h-0 flex-col gap-4">
          {/* Video sahnesi: geniş ekranda yüksekliğe göre ölçeklenir, taşma olmaz */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="player-stage w-full">
              {venueDbId && (
                <YouTubePlayer venueDbId={venueDbId} loginHref={`/admin/${venueId}/login`} />
              )}
            </div>
          </div>

          <div
            className="shrink-0 rounded-2xl p-4"
            style={{ background: "linear-gradient(145deg, #2d1045 0%, #1a0e2a 100%)", border: "1px solid rgba(233,30,140,0.15)" }}
          >
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#0f0a18]">
                {nowPlaying?.songs?.album_cover_url ? (
                  <Image
                    src={nowPlaying.songs.album_cover_url}
                    alt=""
                    width={56}
                    height={56}
                    sizes="56px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="1.8" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isPlaying && (
                    <div className="flex h-3 items-end gap-0.5">
                      {[3, 5, 4, 6, 3].map((h, i) => (
                        <div
                          key={i}
                          className="w-[3px] rounded-full"
                          style={{
                            height: `${h * 2}px`,
                            background: "#e91e8c",
                            transformOrigin: "bottom",
                            animation: `eq-bar ${0.5 + i * 0.12}s ease-in-out infinite alternate`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#e91e8c]">
                    {isPlaying ? "Şu An Çalıyor" : "Duraklatıldı"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-lg font-bold text-white md:text-xl">
                  {nowPlaying?.songs?.title ?? "Şu an çalan yok"}
                </p>
                <p className="truncate text-sm text-[#9ca3af]">{nowPlaying?.songs?.artist ?? ""}</p>
              </div>

              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-[10px] uppercase tracking-wider text-[#6b7280]">Kalan</p>
                <p className="text-lg font-bold tabular-nums text-white">{formatTime(remainingMs)}</p>
              </div>
            </div>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #e91e8c, #8b5cf6)" }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs tabular-nums text-[#6b7280]">
              <span>{formatTime(progressMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </div>
        </div>

        {/* Sıradakiler — videonun yanında, asla üstünde değil */}
        <aside className="flex min-h-0 flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9ca3af]">Sıradakiler</p>
            {loaded && queueTotal > 0 && (
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-[#9ca3af]">
                {queueTotal} şarkı
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {!loaded ? (
              [1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl bg-white/[0.03] p-2.5">
                  <div className="h-12 w-12 shrink-0 rounded-xl bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-3/4 rounded bg-white/10" />
                    <div className="h-3 w-1/2 rounded bg-white/10" />
                  </div>
                </div>
              ))
            ) : queue.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="1.8" />
                </svg>
                <p className="text-sm text-[#6b7280]">Kuyruk boş</p>
                <p className="text-xs text-[#6b7280]">Müşteriler telefondan şarkı ekleyebilir</p>
              </div>
            ) : (
              queue.map((item, idx) => {
                const next = idx === 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl p-2.5"
                    style={
                      next
                        ? { background: "linear-gradient(145deg, #2d1045 0%, #1a0e2a 100%)", border: "1px solid rgba(233,30,140,0.25)" }
                        : { background: "#1a0e2a", border: "1px solid transparent" }
                    }
                  >
                    <span
                      className="w-5 shrink-0 text-center text-sm font-bold tabular-nums"
                      style={{ color: next ? "#e91e8c" : "#6b7280" }}
                    >
                      {idx + 1}
                    </span>

                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#0f0a18]">
                      {item.songs?.album_cover_url ? (
                        <Image
                          src={item.songs.album_cover_url}
                          alt=""
                          width={48}
                          height={48}
                          sizes="48px"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-white/10" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{item.songs?.title}</p>
                      <p className="truncate text-xs text-[#6b7280]">{item.songs?.artist}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {item.priority && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
                        >
                          Önce
                        </span>
                      )}
                      <span className="text-xs font-bold tabular-nums" style={{ color: item.priority ? "#e91e8c" : "#9ca3af" }}>
                        {formatWait(getRowWaitMs(idx))}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {queueTotal > queue.length && (
            <p className="mt-2 shrink-0 text-center text-[11px] text-[#6b7280]">
              +{queueTotal - queue.length} şarkı daha kuyrukta
            </p>
          )}

          <div className="mt-3 shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6b7280]">Sıradaki şarkıyı sen seç</p>
            <p className="truncate text-sm font-bold text-white">playmyjam.com.tr</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
