"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import AddSongSheet from "@/components/browse/AddSongSheet";

type QueueEntry = {
  priority: boolean;
  songs: { duration_ms: number } | null;
};

type VenueSong = {
  id: string;
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  play_count: number;
  in_venue_list: boolean;
};

type DisplaySong = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  id?: string;
  play_count?: number;
  in_venue_list?: boolean;
};

const COOLDOWN_MS = 30 * 60 * 1000;

interface Props {
  venueId: string;
  venueDbId: string;
  initialVenueSongs: VenueSong[];
  initialQueuedSongIds: string[];
  initialRecentlyPlayed: { song_id: string; played_at: number }[];
  initialTokenBalance: number;
  initialFavoriteIds: string[];
}

export default function BrowseClient({
  venueId,
  venueDbId,
  initialVenueSongs,
  initialQueuedSongIds,
  initialRecentlyPlayed,
  initialTokenBalance,
  initialFavoriteIds,
}: Props) {
  const [venueSongs, setVenueSongs] = useState<VenueSong[]>(initialVenueSongs);
  const [queuedSongIds, setQueuedSongIds] = useState<Set<string>>(new Set(initialQueuedSongIds));
  const [tokenBalance, setTokenBalance] = useState(initialTokenBalance);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set(initialFavoriteIds));
  const [recentlyPlayedIds] = useState<Map<string, number>>(
    new Map(initialRecentlyPlayed.map((r) => [r.song_id, r.played_at]))
  );
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [remainingCurrentMs, setRemainingCurrentMs] = useState(0);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "az" | "plays">("default");
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<DisplaySong | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<DisplaySong[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    venueSongs.forEach((s) => map.set(s.spotify_track_id, s));
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
        .select("play_count, in_venue_list, songs(id, spotify_track_id, title, artist, album_cover_url, duration_ms)")
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

    const fetchQueue = async () => {
      const { data } = await supabase
        .from("queue")
        .select("priority, songs(duration_ms)")
        .eq("venue_id", venueDbId)
        .eq("status", "queued")
        .not("user_id", "is", null);
      if (data) setQueueEntries(data as unknown as QueueEntry[]);
    };

    const fetchNowPlaying = async () => {
      const { data } = await supabase
        .from("now_playing")
        .select("progress_ms, is_playing, songs(duration_ms)")
        .eq("venue_id", venueDbId)
        .single();
      const row = data as unknown as { progress_ms: number; is_playing: boolean; songs: { duration_ms: number } | null } | null;
      if (row?.songs) {
        setRemainingCurrentMs(Math.max(row.songs.duration_ms - (row.progress_ms ?? 0), 0));
      } else {
        setRemainingCurrentMs(0);
      }
    };

    fetchQueue();
    fetchNowPlaying();

    const qChannel = supabase
      .channel(`browse-queue:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueDbId}` }, fetchQueue)
      .subscribe();

    const npChannel = supabase
      .channel(`browse-now-playing:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` }, fetchNowPlaying)
      .subscribe();

    return () => {
      supabase.removeChannel(qChannel);
      supabase.removeChannel(npChannel);
    };
  }, [venueDbId, supabase]);

  const searchSpotify = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) { setSearchResults([]); return; }
      setSearchResults(data.tracks ?? []);
    } finally {
      setSearching(false);
    }
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => searchSpotify(value), 400);
  };

  const displaySongs = useMemo<DisplaySong[]>(() => {
    if (query.trim()) {
      return searchResults.map((r) => {
        const vs = venueSongMap.get(r.spotify_track_id);
        return { ...r, id: vs?.id, play_count: vs?.play_count, in_venue_list: vs?.in_venue_list };
      });
    }
    let result: DisplaySong[] = [...venueSongs];
    if (sortBy === "az") result = result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "plays") result = result.sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0));
    return result;
  }, [query, searchResults, venueSongs, sortBy, venueSongMap]);

  const handleAdd = async (priority: boolean) => {
    if (!selectedSong || !venueDbId || !selectedSong.id) return;
    if (isAddingRef.current) return;
    isAddingRef.current = true;

    // Optimistic update: close sheet and update UI immediately
    const cost = priority ? 2 : 1;
    const songId = selectedSong.id;
    const spotifyId = selectedSong.spotify_track_id;
    setTokenBalance((b) => b - cost);
    setAddedIds((s) => new Set(s).add(spotifyId));
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
      setAddedIds((s) => { const n = new Set(s); n.delete(spotifyId); return n; });
      setQueuedSongIds((s) => { const n = new Set(s); n.delete(songId); return n; });
    }
    isAddingRef.current = false;
  };

  const handleRequest = async (song: DisplaySong) => {
    if (!venueDbId) return;

    // Optimistic update
    setRequestedIds((s) => new Set(s).add(song.spotify_track_id));

    await fetch(`/api/venue/${venueId}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spotify_track_id: song.spotify_track_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url,
        duration_ms: song.duration_ms,
      }),
    });
  };

  const toggleFavorite = async (song: DisplaySong) => {
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
  };

  const getCooldown = (song: DisplaySong) => {
    if (song.id && queuedSongIds.has(song.id)) return { remainingMs: COOLDOWN_MS, reason: "queued" as const };
    if (song.id) {
      const playedAt = recentlyPlayedIds.get(song.id);
      if (playedAt) {
        const remaining = playedAt + COOLDOWN_MS - Date.now();
        if (remaining > 0) return { remainingMs: remaining, reason: "played" as const };
      }
    }
    return { remainingMs: 0, reason: null };
  };

  const isInVenueList = (song: DisplaySong) => song.in_venue_list === true;

  const waitNormalMs = useMemo(
    () => remainingCurrentMs + queueEntries.reduce((sum, e) => sum + (e.songs?.duration_ms ?? 0), 0),
    [queueEntries, remainingCurrentMs]
  );
  const waitPriorityMs = useMemo(
    () => remainingCurrentMs + queueEntries.filter((e) => e.priority).reduce((sum, e) => sum + (e.songs?.duration_ms ?? 0), 0),
    [queueEntries, remainingCurrentMs]
  );

  return (
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%" }}>
      <div style={{ padding: "48px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ color: "white", fontWeight: 700, fontSize: 20, margin: 0 }}>Şarkı Kütüphanesi</h1>
          {!query.trim() && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSortOpen((v) => !v)}
                style={{ width: 36, height: 36, borderRadius: "50%", background: sortOpen || sortBy !== "default" ? "rgba(233,30,140,0.2)" : "rgba(255,255,255,0.1)", border: sortBy !== "default" ? "1px solid rgba(233,30,140,0.4)" : "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M7 12h10M11 18h2" stroke={sortBy !== "default" ? "#e91e8c" : "#9ca3af"} strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              {sortOpen && (
                <div style={{ position: "absolute", right: 0, top: 44, zIndex: 50, background: "#1e1130", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden", minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                  {([{ key: "default", label: "Varsayılan" }, { key: "az", label: "A'dan Z'ye" }, { key: "plays", label: "En Çok Çalınan" }] as const).map((opt, idx, arr) => (
                    <button key={opt.key} onClick={() => { setSortBy(opt.key); setSortOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: idx < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", color: sortBy === opt.key ? "#e91e8c" : "white", fontSize: 14, fontWeight: 500 }}>
                      {opt.label}
                      {sortBy === opt.key && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {query.trim() && searching && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke="#6b7280" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
          )}
        </div>

        <div style={{ position: "relative", width: "100%" }}>
          <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="2" /><path d="M20 20l-3-3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
          <input
            type="text"
            placeholder="Spotify'da şarkı, sanatçı ara..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "14px 16px 14px 44px", color: "white", fontSize: 14, outline: "none" }}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setSearchResults([]); }}
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "0 20px 120px" }}>
        {displaySongs.length === 0 && !searching && (
          <p style={{ color: "#6b7280", textAlign: "center", marginTop: 40 }}>
            {query.trim() ? "Sonuç bulunamadı" : "Şarkı bulunamadı"}
          </p>
        )}
        {displaySongs.map((song) => {
          const isAdded = addedIds.has(song.spotify_track_id);
          const isRequested = requestedIds.has(song.spotify_track_id);
          const isFav = song.id ? favoriteIds.has(song.id) : false;
          const inList = isInVenueList(song);
          const cooldown = getCooldown(song);
          const isOnCooldown = cooldown.remainingMs > 0;
          const cooldownMins = Math.ceil(cooldown.remainingMs / 60000);

          return (
            <div key={song.spotify_track_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
                <div
                  onClick={() => router.push(`/venue/${venueId}/song/${song.spotify_track_id}`)}
                  style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, cursor: "pointer" }}
                >
                  <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, overflow: "hidden", background: "#1a0e2a" }}>
                    {song.album_cover_url && (
                      <Image src={song.album_cover_url} alt={song.title} width={56} height={56} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "white", fontWeight: 600, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{song.title}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ color: "#6b7280", fontSize: 12 }}>{song.artist}</span>
                      {(song.play_count ?? 0) > 0 && (
                        <><span style={{ color: "#6b7280", fontSize: 12 }}>•</span><span style={{ color: "#e91e8c", fontSize: 12, fontWeight: 500 }}>{song.play_count}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg></>
                      )}
                    </div>
                  </div>
                </div>

                {song.id && (
                  <button onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? "#e91e8c" : "none"}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke={isFav ? "#e91e8c" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                )}

                <div style={{ flexShrink: 0 }}>
                  {inList ? (
                    isOnCooldown ? (
                      <div style={{ height: 32, borderRadius: 10, border: "1px solid rgba(107,114,128,0.3)", background: "rgba(107,114,128,0.08)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px", gap: 3 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#6b7280" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
                        <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600 }}>{cooldownMins}dk</span>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); !isAdded && setSelectedSong(song); }}
                        style={{ width: 36, height: 36, borderRadius: "50%", border: isAdded ? "1px solid rgba(233,30,140,0.4)" : "1px solid rgba(255,255,255,0.15)", background: isAdded ? "rgba(233,30,140,0.2)" : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: isAdded ? "default" : "pointer" }}
                      >
                        {isAdded ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
                        )}
                      </button>
                    )
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); !isRequested && handleRequest(song); }}
                      style={{ height: 32, borderRadius: 10, border: isRequested ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(251,191,36,0.4)", background: isRequested ? "rgba(251,191,36,0.07)" : "rgba(251,191,36,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: isRequested ? "default" : "pointer", padding: "0 10px", gap: 4 }}
                    >
                      {isRequested ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" /></svg>
                      )}
                      <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 600 }}>
                        {isRequested ? "İstendi" : "İstek"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <AddSongSheet
        song={selectedSong}
        tokenBalance={tokenBalance}
        cooldown={selectedSong ? getCooldown(selectedSong) : undefined}
        waitNormalMs={waitNormalMs}
        waitPriorityMs={waitPriorityMs}
        onClose={() => setSelectedSong(null)}
        onAdd={handleAdd}
      />
    </div>
  );
}
