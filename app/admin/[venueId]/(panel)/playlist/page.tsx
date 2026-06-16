"use client";

import { useState, useEffect, useRef, useMemo, useCallback, use } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Song = {
  venueSongId: string;
  id: string;
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  play_count: number;
  in_venue_list: boolean;
};

type SpotifyTrack = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
  duration_ms: number;
  preview_url: string | null;
};

type SpotifyPlaylist = {
  id: string;
  name: string;
  image_url: string | null;
  track_count: number;
  owner: string | null;
};

export default function PlaylistPage({ params }: Props) {
  const { venueId } = use(params);
  const [venueDbId, setVenueDbId] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Playlist import state
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState("");

  // Spotify search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchSongs = useCallback(async (venueDbIdArg: string) => {
    type VenueSongRow = {
      id: string;
      play_count: number;
      in_venue_list: boolean;
      songs: Omit<Song, "venueSongId" | "play_count" | "in_venue_list"> | null;
    };

    const { data } = await supabase
      .from("venue_songs")
      .select("id, play_count, in_venue_list, songs(id, spotify_track_id, title, artist, album_cover_url, duration_ms)")
      .eq("venue_id", venueDbIdArg)
      .order("added_at", { ascending: false });

    if (data) {
      const rows = data as unknown as VenueSongRow[];
      setSongs(
        rows
          .filter((vs) => vs.songs)
          .map((vs) => ({ ...vs.songs!, venueSongId: vs.id, play_count: vs.play_count, in_venue_list: vs.in_venue_list }))
      );
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { data: venue } = await supabase.from("venues").select("id").eq("slug", venueId).single();
      if (cancelled || !venue) return;
      setVenueDbId(venue.id);

      await fetchSongs(venue.id);

      channel = supabase
        .channel(`venue_songs:${venue.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "venue_songs", filter: `venue_id=eq.${venue.id}` }, () => {
          fetchSongs(venue.id);
        })
        .subscribe();
    };
    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId, supabase, fetchSongs]);

  const toggleInList = async (venueSongId: string, current: boolean) => {
    const res = await fetch("/api/admin/playlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue_song_id: venueSongId, in_venue_list: !current }),
    });
    if (res.ok) {
      setSongs((prev) => prev.map((s) => s.venueSongId === venueSongId ? { ...s, in_venue_list: !current } : s));
    }
  };

  const deleteSong = async (venueSongId: string) => {
    const res = await fetch("/api/admin/playlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue_song_id: venueSongId }),
    });
    if (res.ok) {
      setSongs((prev) => prev.filter((s) => s.venueSongId !== venueSongId));
    }
  };

  const doSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) { setSearchError(data.error ?? "Arama başarısız"); return; }
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
    if (!value.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => doSearch(value), 350);
  };

  const addSpotifyTrack = async (track: SpotifyTrack) => {
    setAddingId(track.spotify_track_id);
    setSearchError("");

    try {
      const res = await fetch("/api/admin/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(track),
      });
      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.error ?? "Eklenemedi");
        return;
      }

      setSongs((prev) => [{
        venueSongId: data.venueSongId,
        id: data.songId,
        spotify_track_id: track.spotify_track_id,
        title: track.title,
        artist: track.artist,
        album_cover_url: track.album_cover_url ?? "",
        duration_ms: track.duration_ms,
        play_count: 0,
        in_venue_list: true,
      }, ...prev]);
    } catch {
      setSearchError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setAddingId(null);
    }
  };

  const formatDur = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const closeModal = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowAddModal(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
  };

  const openPlaylistModal = async () => {
    setShowPlaylistModal(true);
    setPlaylistError("");
    setImportResult("");
    setPlaylistsLoading(true);
    try {
      const res = await fetch("/api/admin/spotify/playlists");
      const data = await res.json();
      if (!res.ok) {
        setPlaylistError(data.error ?? "Playlist'ler alınamadı");
        return;
      }
      setPlaylists(data.playlists ?? []);
    } catch {
      setPlaylistError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setPlaylistsLoading(false);
    }
  };

  const closePlaylistModal = () => {
    setShowPlaylistModal(false);
    setPlaylists([]);
    setPlaylistError("");
    setImportResult("");
  };

  const importPlaylist = async (playlist: SpotifyPlaylist) => {
    setImportingId(playlist.id);
    setPlaylistError("");
    setImportResult("");
    try {
      const res = await fetch("/api/admin/playlist/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: playlist.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlaylistError(data.error ?? "İçe aktarılamadı");
        return;
      }
      setImportResult(
        `"${playlist.name}": ${data.added} şarkı eklendi${data.skipped ? `, ${data.skipped} şarkı zaten vardı` : ""}`
      );
      if (venueDbId) await fetchSongs(venueDbId);
    } catch {
      setPlaylistError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white font-bold text-2xl">Playlist</h1>
        <div className="flex items-center gap-2">
          <button onClick={openPlaylistModal} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#1DB954", color: "white" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
            Playlist Ekle
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#e91e8c", color: "white" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
            Şarkı Ekle
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {songs.length === 0 ? (
          <div className="py-10 text-center text-[#6b7280] text-sm">Henüz şarkı yok</div>
        ) : (
          songs.map((song, i) => (
            <div key={song.venueSongId} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors" style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/10">
                {song.album_cover_url ? (
                  <Image src={song.album_cover_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{song.title}</p>
                <p className="text-[#6b7280] text-xs">{song.artist} {song.duration_ms ? `· ${formatDur(song.duration_ms)}` : ""} · {song.play_count} çalınma</p>
              </div>
              <button onClick={() => toggleInList(song.venueSongId, song.in_venue_list)} className="text-xs px-2.5 py-1.5 rounded-lg font-medium shrink-0 transition-all" style={{ background: song.in_venue_list ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.08)", color: song.in_venue_list ? "#22c55e" : "#9ca3af" }}>
                {song.in_venue_list ? "Aktif" : "Pasif"}
              </button>
              <button onClick={() => deleteSong(song.venueSongId)} className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0" style={{ background: "rgba(239,68,68,0.1)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Spotify Playlist Import Modal */}
      {showPlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={closePlaylistModal} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 p-6 flex flex-col max-h-[80vh]" style={{ background: "#1a1025" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Spotify Playlist&apos;i İçe Aktar</h3>
              <button onClick={closePlaylistModal} className="text-[#6b7280] hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            {importResult && (
              <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>{importResult}</p>
            )}
            {playlistError && (
              <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{playlistError}</p>
            )}

            <div className="overflow-y-auto flex-1">
              {playlistsLoading ? (
                <div className="flex justify-center py-8">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="#6b7280" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
                </div>
              ) : playlists.length === 0 && !playlistError ? (
                <p className="text-center text-[#6b7280] text-sm py-6">Hesapta playlist bulunamadı</p>
              ) : (
                playlists.map((playlist) => (
                  <div key={playlist.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/10">
                      {playlist.image_url ? (
                        <Image src={playlist.image_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{playlist.name}</p>
                      <p className="text-[#6b7280] text-xs truncate">{playlist.owner ? `${playlist.owner} · ` : ""}{playlist.track_count} şarkı</p>
                    </div>
                    <button
                      onClick={() => importPlaylist(playlist)}
                      disabled={importingId !== null}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0 disabled:opacity-50"
                      style={{ background: "rgba(29,185,84,0.15)", color: "#1DB954" }}
                    >
                      {importingId === playlist.id ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="#1DB954" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
                      ) : (
                        "Ekle"
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spotify Search Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeModal} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 p-6 flex flex-col max-h-[80vh]" style={{ background: "#1a1025" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Spotify&apos;da Şarkı Ara</h3>
              <button onClick={closeModal} className="text-[#6b7280] hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="relative mb-4">
              <input
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch(searchQuery)}
                placeholder="Şarkı adı veya sanatçı..."
                autoFocus
                className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="#6b7280" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
                </div>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {searchError && (
                <p className="text-center text-red-400 text-sm py-6">{searchError}</p>
              )}
              {!searchError && searchResults.length === 0 && !searching && (
                <p className="text-center text-[#6b7280] text-sm py-6">
                  {searchQuery ? "Sonuç bulunamadı" : "Aramak istediğin şarkıyı yaz"}
                </p>
              )}
              {searchResults.map((track) => (
                <div key={track.spotify_track_id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/10">
                    {track.album_cover_url ? (
                      <Image src={track.album_cover_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{track.title}</p>
                    <p className="text-[#6b7280] text-xs truncate">{track.artist} · {formatDur(track.duration_ms)}</p>
                  </div>
                  <button
                    onClick={() => addSpotifyTrack(track)}
                    disabled={addingId === track.spotify_track_id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 disabled:opacity-50"
                    style={{ background: "rgba(233,30,140,0.15)" }}
                  >
                    {addingId === track.spotify_track_id ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="#e91e8c" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" /></svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
