"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import AddSongSheet from "@/components/browse/AddSongSheet";
import NowPlayingBanner from "@/components/browse/NowPlayingBanner";
import SearchView from "@/components/browse/SearchView";
import SongCard from "@/components/browse/SongCard";
import SongRow from "@/components/browse/SongRow";
import {
  artistKey,
  getCooldown,
  getSongActionState,
  primaryArtist,
  type BrowseUserState,
  type DisplaySong,
  type QueueEntry,
  type VenueSong,
} from "@/components/browse/browse-types";

type ArtistEntry = {
  key: string;
  name: string;
  songCount: number;
  totalPlays: number;
  coverUrl: string;
  coverPlays: number;
};

interface Props {
  venueId: string;
  venueDbId: string;
  initialVenueSongs: VenueSong[];
}

export default function BrowseClient({ venueId, venueDbId, initialVenueSongs }: Props) {
  const [venueSongs, setVenueSongs] = useState<VenueSong[]>(initialVenueSongs);
  const [queuedSongIds, setQueuedSongIds] = useState<Set<string>>(new Set());
  const [tokenBalance, setTokenBalance] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [recentlyPlayedIds, setRecentlyPlayedIds] = useState<Map<string, number>>(new Map());
  const [recentPlays, setRecentPlays] = useState<{ song_id: string; played_at: number }[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<BrowseUserState["now_playing"]>(null);
  const [sortBy, setSortBy] = useState<"default" | "az" | "plays">("default");
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<DisplaySong | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [stateLoaded, setStateLoaded] = useState(false);
  const isAddingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    // getSession reads from local cache — no network round-trip
    supabase.auth.getSession().then(({ data }: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
      userIdRef.current = data.session?.user?.id ?? null;
    });
  }, [supabase]);

  const venueSongMap = useMemo(() => {
    const map = new Map<string, VenueSong>();
    venueSongs.forEach((s) => map.set(s.youtube_video_id, s));
    return map;
  }, [venueSongs]);

  useEffect(() => {
    if (!venueDbId) return;

    type VenueSongRow = {
      play_count: number;
      in_venue_list: boolean;
      songs: Omit<VenueSong, "play_count" | "in_venue_list"> | null;
    };

    const fetchVenueSongs = async () => {
      const { data: vSongs } = await supabase
        .from("venue_songs")
        .select("play_count, in_venue_list, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueDbId);

      if (vSongs) {
        const rows = vSongs as unknown as VenueSongRow[];
        setVenueSongs(
          rows
            .filter((vs) => vs.songs)
            .map((vs) => ({ ...vs.songs!, play_count: vs.play_count, in_venue_list: vs.in_venue_list }))
        );
      }
    };

    const channel = supabase
      .channel(`browse-venue-songs:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_songs", filter: `venue_id=eq.${venueDbId}` }, fetchVenueSongs)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueDbId, supabase]);

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    // Kullanıcı + canlı durum tek round-trip (0006'daki RPC): kuyruktakiler,
    // son çalınanlar, bakiye, favoriler, bekleme süresi girdileri
    const fetchUserState = async () => {
      const { data } = await supabase.rpc("get_browse_user_state", { p_venue_id: venueDbId });
      if (cancelled || !data) return;
      const state = data as unknown as BrowseUserState;

      setQueuedSongIds(new Set(state.queued_song_ids ?? []));
      setTokenBalance(state.token_balance ?? 0);
      setFavoriteIds(new Set(state.favorite_ids ?? []));
      setQueueEntries(state.queue_entries ?? []);
      setRecentPlays(state.recently_played ?? []);
      // Banner otomatik çalmada da görünsün: kaynak now_playing tablosu;
      // 0014 öncesi RPC song_id döndürmüyorsa müşteri kuyruğundaki kayda düş
      setPlayingSongId(state.now_playing?.song_id ?? state.playing?.song_id ?? null);
      setNowPlaying(state.now_playing ?? null);

      const played = new Map((state.recently_played ?? []).map((r) => [r.song_id, r.played_at]));
      if (state.playing?.song_id) played.set(state.playing.song_id, state.playing.started_at);
      setRecentlyPlayedIds(played);
      setStateLoaded(true);
    };

    fetchUserState();

    const qChannel = supabase
      .channel(`browse-queue:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueDbId}` }, fetchUserState)
      .subscribe();

    const npChannel = supabase
      .channel(`browse-now-playing:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` }, fetchUserState)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(qChannel);
      supabase.removeChannel(npChannel);
    };
  }, [venueDbId, supabase]);

  const remainingCurrentMs = useMemo(
    () => (nowPlaying ? Math.max(nowPlaying.duration_ms - (nowPlaying.progress_ms ?? 0), 0) : 0),
    [nowPlaying]
  );

  const songById = useMemo(() => {
    const map = new Map<string, VenueSong>();
    venueSongs.forEach((s) => map.set(s.id, s));
    return map;
  }, [venueSongs]);

  const topSongs = useMemo(
    () =>
      venueSongs
        .filter((s) => s.in_venue_list && s.play_count > 0)
        .sort((a, b) => b.play_count - a.play_count)
        .slice(0, 10),
    [venueSongs]
  );

  const artists = useMemo(() => {
    const map = new Map<string, ArtistEntry>();
    for (const s of venueSongs) {
      const name = primaryArtist(s.artist);
      if (!name) continue;
      const key = name.toLocaleLowerCase("tr");
      const entry = map.get(key);
      if (!entry) {
        map.set(key, { key, name, songCount: 1, totalPlays: s.play_count, coverUrl: s.album_cover_url, coverPlays: s.play_count });
      } else {
        entry.songCount += 1;
        entry.totalPlays += s.play_count;
        if (s.play_count > entry.coverPlays) {
          entry.coverUrl = s.album_cover_url;
          entry.coverPlays = s.play_count;
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => b.songCount - a.songCount || b.totalPlays - a.totalPlays)
      .slice(0, 12);
  }, [venueSongs]);

  const recentSongs = useMemo(() => {
    const seen = new Set<string>();
    const result: VenueSong[] = [];
    const sorted = [...recentPlays].sort((a, b) => b.played_at - a.played_at);
    for (const r of sorted) {
      if (seen.has(r.song_id) || r.song_id === playingSongId) continue;
      seen.add(r.song_id);
      const song = songById.get(r.song_id);
      if (song) result.push(song);
      if (result.length >= 10) break;
    }
    return result;
  }, [recentPlays, playingSongId, songById]);

  const nowPlayingSong = playingSongId ? songById.get(playingSongId) : undefined;

  // Sanatçı seçiliyken onun şarkıları; değilse mekanın en çok çalınan 10 şarkısı
  const listSongs = useMemo(() => {
    if (!selectedArtist) return topSongs;
    const result = venueSongs.filter((s) => artistKey(s.artist) === selectedArtist);
    if (sortBy === "az") result.sort((a, b) => a.title.localeCompare(b.title, "tr"));
    else if (sortBy === "plays") result.sort((a, b) => b.play_count - a.play_count);
    return result;
  }, [venueSongs, selectedArtist, sortBy, topSongs]);

  const selectedArtistName = selectedArtist
    ? artists.find((a) => a.key === selectedArtist)?.name ??
      (listSongs[0] ? primaryArtist(listSongs[0].artist) : selectedArtist)
    : null;

  const favoriteSongs = useMemo(
    () => venueSongs.filter((s) => favoriteIds.has(s.id)).slice(0, 10),
    [venueSongs, favoriteIds]
  );

  const actionFor = useCallback(
    (song: DisplaySong) => getSongActionState(song, { queuedSongIds, recentlyPlayedAt: recentlyPlayedIds, addedIds, requestedIds }),
    [queuedSongIds, recentlyPlayedIds, addedIds, requestedIds]
  );

  // Şansına bırak: cooldown'da/kuyrukta olmayan listeden rastgele bir şarkıyla sheet'i aç
  const luckyPick = useCallback(() => {
    const eligible = venueSongs.filter((s) => s.in_venue_list && actionFor(s).kind === "add");
    if (eligible.length === 0) return;
    setSelectedSong(eligible[Math.floor(Math.random() * eligible.length)]);
  }, [venueSongs, actionFor]);

  const openSong = useCallback(
    (song: DisplaySong) => router.push(`/venue/${venueId}/song/${song.youtube_video_id}`),
    [router, venueId]
  );

  const openSheet = useCallback((song: DisplaySong) => setSelectedSong(song), []);

  const handleAdd = async (priority: boolean) => {
    if (!selectedSong || !venueDbId || !selectedSong.id) return;
    if (isAddingRef.current) return;
    isAddingRef.current = true;

    // Optimistic update: close sheet and update UI immediately
    const cost = priority ? 2 : 1;
    const songId = selectedSong.id;
    const videoId = selectedSong.youtube_video_id;
    setTokenBalance((b) => b - cost);
    setAddedIds((s) => new Set(s).add(videoId));
    setQueuedSongIds((s) => new Set(s).add(songId));
    setSelectedSong(null);

    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue_id: venueDbId, song_id: songId, priority }),
    });

    if (!res.ok) {
      // Rollback on error
      setTokenBalance((b) => b + cost);
      setAddedIds((s) => { const n = new Set(s); n.delete(videoId); return n; });
      setQueuedSongIds((s) => { const n = new Set(s); n.delete(songId); return n; });
    }
    isAddingRef.current = false;
  };

  const handleRequest = useCallback(async (song: DisplaySong) => {
    if (!venueDbId) return;

    // Optimistic update
    setRequestedIds((s) => new Set(s).add(song.youtube_video_id));

    await fetch(`/api/venue/${venueId}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtube_video_id: song.youtube_video_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url,
        duration_ms: song.duration_ms,
      }),
    });
  }, [venueDbId, venueId]);

  const toggleFavorite = useCallback(async (song: DisplaySong) => {
    if (!song.id) return;
    const userId = userIdRef.current;
    if (!userId) return;

    // Optimistic update
    const wasFav = favoriteIds.has(song.id);
    if (wasFav) {
      setFavoriteIds((s) => { const n = new Set(s); n.delete(song.id!); return n; });
      await supabase.from("user_favorites").delete().eq("user_id", userId).eq("song_id", song.id);
    } else {
      setFavoriteIds((s) => new Set(s).add(song.id!));
      await supabase.from("user_favorites").insert({ user_id: userId, song_id: song.id });
    }
  }, [favoriteIds, supabase]);

  const waitNormalMs = useMemo(
    () => remainingCurrentMs + queueEntries.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0),
    [queueEntries, remainingCurrentMs]
  );
  const waitPriorityMs = useMemo(
    () => remainingCurrentMs + queueEntries.filter((e) => e.priority).reduce((sum, e) => sum + (e.duration_ms ?? 0), 0),
    [queueEntries, remainingCurrentMs]
  );

  const sortOptions = [
    { key: "default", label: "Varsayılan" },
    { key: "az", label: "A'dan Z'ye" },
    { key: "plays", label: "En Çok Çalınan" },
  ] as const;

  return (
    <div className="min-h-dvh w-full bg-[#0f0a18]">
      {/* Sticky başlık + sahte arama çubuğu (dokununca tam ekran arama açılır) */}
      <div className="sticky top-0 z-30 bg-[#0f0a18]/95 px-5 pb-3 pt-12 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Gözat</h1>
          <Link
            href={`/venue/${venueId}/tokens`}
            className="flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-[#1a0e2a] px-3 transition-transform active:scale-95"
            aria-label="Jeton bakiyen — jeton yükle"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fbbf24" strokeWidth="2" /><circle cx="12" cy="12" r="4" stroke="#fbbf24" strokeWidth="2" /></svg>
            {stateLoaded ? (
              <span className="text-sm font-bold text-white">{tokenBalance}</span>
            ) : (
              <span className="h-3.5 w-4 animate-pulse rounded bg-white/10" />
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" /></svg>
          </Link>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#1a0e2a] px-4 text-left transition-transform active:scale-[0.98]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="2" /><path d="M20 20l-3-3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
            <span className="text-sm text-[#6b7280]">Şarkı, sanatçı ara...</span>
          </button>
          <button
            onClick={luckyPick}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#1a0e2a] transition-transform active:scale-95"
            aria-label="Rastgele şarkı öner"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      <div className="pt-4">
        {!selectedArtist && nowPlayingSong && nowPlaying && (
          <div className="mb-6 px-5">
            <NowPlayingBanner
              song={nowPlayingSong}
              progressMs={nowPlaying.progress_ms ?? 0}
              durationMs={nowPlaying.duration_ms}
              isPlaying={nowPlaying.is_playing}
              onClick={() => router.push(`/venue/${venueId}/queue`)}
            />
          </div>
        )}

        {!selectedArtist && favoriteSongs.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#e91e8c"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                <h2 className="text-base font-bold text-white">Favorilerin</h2>
              </div>
              <Link href={`/venue/${venueId}/favorites`} className="text-xs font-semibold text-[#e91e8c]">
                Tümü
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto px-5">
              {favoriteSongs.map((song) => (
                <SongCard key={song.youtube_video_id} song={song} action={actionFor(song)} onOpen={openSong} onAdd={openSheet} onRequest={handleRequest} />
              ))}
            </div>
          </section>
        )}

        {!selectedArtist && topSongs.length >= 3 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2 px-5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2c0 4-5 6-5 11a5 5 0 0010 0c0-2-1-3.5-2-5-1 2-3 2.5-3 0 0-2 0-4 0-6z" stroke="#e91e8c" strokeWidth="2" strokeLinejoin="round" /></svg>
              <h2 className="text-base font-bold text-white">En Çok İstenenler</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto px-5">
              {topSongs.map((song) => (
                <SongCard key={song.youtube_video_id} song={song} action={actionFor(song)} onOpen={openSong} onAdd={openSheet} onRequest={handleRequest} />
              ))}
            </div>
          </section>
        )}

        {artists.length >= 3 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2 px-5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2a4 4 0 00-4 4v5a4 4 0 008 0V6a4 4 0 00-4-4z" stroke="#e91e8c" strokeWidth="2" /><path d="M5 11a7 7 0 0014 0M12 18v4" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" /></svg>
              <h2 className="text-base font-bold text-white">Sanatçılar</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto px-5">
              {artists.map((a) => {
                const active = selectedArtist === a.key;
                return (
                  <button
                    key={a.key}
                    onClick={() => setSelectedArtist((cur) => (cur === a.key ? null : a.key))}
                    className="flex w-16 shrink-0 flex-col items-center gap-1.5 transition-transform active:scale-95"
                  >
                    <div className={`h-16 w-16 overflow-hidden rounded-full ${active ? "ring-2 ring-[#e91e8c]" : "ring-1 ring-white/10"}`}>
                      {a.coverUrl ? (
                        <Image src={a.coverUrl} alt={a.name} width={64} height={64} sizes="64px" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#1a0e2a]">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#6b7280" strokeWidth="2" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                        </div>
                      )}
                    </div>
                    <span className={`w-full truncate text-center text-[11px] ${active ? "font-semibold text-[#e91e8c]" : "text-[#9ca3af]"}`}>{a.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!selectedArtist && recentSongs.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2 px-5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#e91e8c" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" /></svg>
              <h2 className="text-base font-bold text-white">Son Çalınanlar</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto px-5">
              {recentSongs.map((song) => (
                <SongCard key={song.youtube_video_id} song={song} action={actionFor(song)} onOpen={openSong} onAdd={openSheet} onRequest={handleRequest} />
              ))}
            </div>
          </section>
        )}

        <section className="px-5 pb-32">
          <div className="mb-1 flex items-center justify-between">
            {selectedArtist ? (
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-bold text-white">{selectedArtistName}</h2>
                <span className="shrink-0 text-xs text-[#9ca3af]">{listSongs.length} şarkı</span>
                <button
                  onClick={() => setSelectedArtist(null)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10"
                  aria-label="Sanatçı filtresini kaldır"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            ) : (
              <h2 className="text-base font-bold text-white">En Çok Çalınanlar</h2>
            )}
            {selectedArtist && (
              <div className="relative">
                <button
                  onClick={() => setSortOpen((v) => !v)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${sortOpen || sortBy !== "default" ? "border border-[#e91e8c]/40 bg-[#e91e8c]/20" : "bg-white/10"}`}
                  aria-label="Sırala"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M7 12h10M11 18h2" stroke={sortBy !== "default" ? "#e91e8c" : "#9ca3af"} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-11 z-40 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#1e1130] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                    {sortOptions.map((opt, idx, arr) => (
                      <button
                        key={opt.key}
                        onClick={() => { setSortBy(opt.key); setSortOpen(false); }}
                        className={`flex w-full items-center justify-between px-4 py-3 text-sm font-medium ${sortBy === opt.key ? "text-[#e91e8c]" : "text-white"} ${idx < arr.length - 1 ? "border-b border-white/5" : ""}`}
                      >
                        {opt.label}
                        {sortBy === opt.key && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {listSongs.length === 0 && (
            <p className="mt-10 text-center text-[#6b7280]">
              {selectedArtist ? "Şarkı bulunamadı" : "Henüz şarkı çalınmadı"}
            </p>
          )}
          {listSongs.map((song) => (
            <SongRow
              key={song.youtube_video_id}
              song={song}
              action={actionFor(song)}
              isFav={favoriteIds.has(song.id)}
              showPlayCount={!!selectedArtist}
              onOpen={openSong}
              onToggleFavorite={toggleFavorite}
              onAdd={openSheet}
              onRequest={handleRequest}
            />
          ))}
        </section>
      </div>

      {searchOpen && (
        <SearchView
          venueSongMap={venueSongMap}
          favoriteIds={favoriteIds}
          actionFor={actionFor}
          recentKey={`pmj:recent-searches:${venueId}`}
          onOpen={openSong}
          onToggleFavorite={toggleFavorite}
          onAdd={openSheet}
          onRequest={handleRequest}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <AddSongSheet
        song={selectedSong}
        tokenBalance={tokenBalance}
        cooldown={selectedSong ? getCooldown(selectedSong, { queuedSongIds, recentlyPlayedAt: recentlyPlayedIds }) : undefined}
        waitNormalMs={waitNormalMs}
        waitPriorityMs={waitPriorityMs}
        onClose={() => setSelectedSong(null)}
        onAdd={handleAdd}
      />
    </div>
  );
}
