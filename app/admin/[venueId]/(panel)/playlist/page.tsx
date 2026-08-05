"use client";

import { useState, useEffect, useRef, useMemo, useCallback, use, Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Song = {
  venueSongId: string;
  id: string;
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  play_count: number;
  in_venue_list: boolean;
};

type Playlist = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

type SearchTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
  duration_ms: number;
};

const ALL = "all";

export default function PlaylistPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PlaylistPageContent params={params} />
    </Suspense>
  );
}

function PlaylistPageContent({ params }: Props) {
  const { venueId } = use(params);
  // Playlistler ekranından "Düzenle" ile gelindiğinde ilgili sekme açık başlar
  const initialListId = useSearchParams().get("list") ?? ALL;
  const [venueDbId, setVenueDbId] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  // song_id -> üyesi olduğu playlist id'leri
  const [memberships, setMemberships] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState<string>(initialListId);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [renaming, setRenaming] = useState<Playlist | null>(null);

  // Şarkı ekleme / içe aktarma hedefi
  const [targetId, setTargetId] = useState("");
  const [importAsNew, setImportAsNew] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [listError, setListError] = useState("");
  const [savingList, setSavingList] = useState(false);

  // Playlist import state — public YouTube playlist URL'si yapıştırılır (OAuth yok)
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [playlistError, setPlaylistError] = useState("");
  const [importResult, setImportResult] = useState("");

  // YouTube search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchAll = useCallback(async (venueDbIdArg: string) => {
    type VenueSongRow = {
      id: string;
      play_count: number;
      in_venue_list: boolean;
      songs: Omit<Song, "venueSongId" | "play_count" | "in_venue_list"> | null;
    };

    const [catalog, lists, members] = await Promise.all([
      supabase
        .from("venue_songs")
        .select("id, play_count, in_venue_list, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueDbIdArg)
        .order("added_at", { ascending: false }),
      supabase
        .from("playlists")
        .select("id, name, is_active, sort_order")
        .eq("venue_id", venueDbIdArg)
        .order("sort_order", { ascending: true }),
      supabase
        .from("playlist_songs")
        .select("playlist_id, song_id")
        .eq("venue_id", venueDbIdArg),
    ]);

    if (catalog.data) {
      const rows = catalog.data as unknown as VenueSongRow[];
      setSongs(
        rows
          .filter((vs) => vs.songs)
          .map((vs) => ({ ...vs.songs!, venueSongId: vs.id, play_count: vs.play_count, in_venue_list: vs.in_venue_list }))
      );
    }
    if (lists.data) setPlaylists(lists.data as Playlist[]);
    if (members.data) {
      const map: Record<string, string[]> = {};
      for (const m of members.data as { playlist_id: string; song_id: string }[]) {
        (map[m.song_id] ??= []).push(m.playlist_id);
      }
      setMemberships(map);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { data: venue } = await supabase.from("venues").select("id").eq("slug", venueId).single();
      if (cancelled || !venue) return;
      setVenueDbId(venue.id);

      await fetchAll(venue.id);

      channel = supabase
        .channel(`venue_playlists:${venue.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "venue_songs", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        .on("postgres_changes", { event: "*", schema: "public", table: "playlists", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        .on("postgres_changes", { event: "*", schema: "public", table: "playlist_songs", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        .subscribe();
    };
    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId, supabase, fetchAll]);

  const activeLists = useMemo(() => playlists.filter((p) => p.is_active), [playlists]);
  const selectedList = useMemo(
    () => playlists.find((p) => p.id === selectedId) ?? null,
    [playlists, selectedId]
  );

  // Seçilen liste silinirse (ya da veri henüz gelmediyse) görünüm "Tümü"ne düşer
  const viewId = selectedList ? selectedId : ALL;

  const countFor = useCallback(
    (playlistId: string) =>
      songs.reduce((n, s) => n + ((memberships[s.id] ?? []).includes(playlistId) ? 1 : 0), 0),
    [songs, memberships]
  );

  const visibleSongs = useMemo(() => {
    if (viewId === ALL) return songs;
    return songs.filter((s) => (memberships[s.id] ?? []).includes(viewId));
  }, [songs, memberships, viewId]);

  // Modal açılırken hedef liste: seçili liste, yoksa ilk aktif, o da yoksa ilk liste
  const defaultTarget = useCallback(() => {
    if (viewId !== ALL) return viewId;
    return activeLists[0]?.id ?? playlists[0]?.id ?? "";
  }, [viewId, activeLists, playlists]);

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

  // Liste görünümünde yalnızca o listeden, "Tümü" görünümünde mekandan tamamen çıkarır
  const removeSong = async (song: Song) => {
    const scoped = viewId !== ALL;
    const lastOne = (memberships[song.id] ?? []).length <= 1;

    if (!scoped || lastOne) {
      const message = scoped
        ? `"${song.title}" başka listede değil — mekandan tamamen kaldırılacak. Devam edilsin mi?`
        : `"${song.title}" tüm listelerden ve mekan katalogundan kaldırılacak. Devam edilsin mi?`;
      if (!confirm(message)) return;
    }

    const res = await fetch("/api/admin/playlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venue_song_id: song.venueSongId,
        ...(scoped ? { playlist_id: viewId } : {}),
      }),
    });
    if (res.ok && venueDbId) await fetchAll(venueDbId);
  };

  const toggleActive = async (playlist: Playlist) => {
    const next = !playlist.is_active;
    setPlaylists((prev) => prev.map((p) => p.id === playlist.id ? { ...p, is_active: next } : p));
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, is_active: next }),
    });
    if (!res.ok) {
      setPlaylists((prev) => prev.map((p) => p.id === playlist.id ? { ...p, is_active: !next } : p));
    }
  };

  const createList = async () => {
    const name = newListName.trim();
    if (!name || savingList) return;
    setSavingList(true);
    setListError("");
    try {
      const res = await fetch("/api/admin/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { setListError(data.error ?? "Oluşturulamadı"); return; }
      setPlaylists((prev) => [...prev, data.playlist as Playlist]);
      setSelectedId(data.playlist.id);
      setShowNewListModal(false);
      setNewListName("");
    } catch {
      setListError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSavingList(false);
    }
  };

  const renameList = async () => {
    const name = newListName.trim();
    if (!renaming || !name || savingList) return;
    setSavingList(true);
    setListError("");
    try {
      const res = await fetch("/api/admin/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: renaming.id, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setListError(data.error ?? "Kaydedilemedi"); return; }
      setPlaylists((prev) => prev.map((p) => p.id === renaming.id ? { ...p, name } : p));
      setRenaming(null);
      setNewListName("");
    } catch {
      setListError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSavingList(false);
    }
  };

  const deleteList = async (playlist: Playlist) => {
    const count = countFor(playlist.id);
    if (!confirm(
      `"${playlist.name}" listesi silinecek.` +
      (count ? ` Yalnızca bu listede olan şarkılar mekan katalogundan da düşer.` : "")
    )) return;

    const res = await fetch("/api/admin/playlists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id }),
    });
    if (res.ok) {
      setSelectedId(ALL);
      if (venueDbId) await fetchAll(venueDbId);
    }
  };

  const doSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
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

  const addTrack = async (track: SearchTrack) => {
    if (!targetId) { setSearchError("Önce bir playlist seçin"); return; }
    setAddingId(track.youtube_video_id);
    setSearchError("");

    try {
      const res = await fetch("/api/admin/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...track, playlist_id: targetId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.error ?? "Eklenemedi");
        return;
      }
      if (venueDbId) await fetchAll(venueDbId);
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

  const openAddModal = () => {
    setTargetId(defaultTarget());
    setShowAddModal(true);
  };

  const closeModal = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowAddModal(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
  };

  const openPlaylistModal = () => {
    const target = defaultTarget();
    setTargetId(target);
    setImportAsNew(!target);
    setNewListName("");
    setShowPlaylistModal(true);
  };

  const closePlaylistModal = () => {
    setShowPlaylistModal(false);
    setPlaylistUrl("");
    setPlaylistError("");
    setImportResult("");
    setNewListName("");
  };

  const importPlaylist = async () => {
    if (!playlistUrl.trim() || importing) return;
    if (!importAsNew && !targetId) { setPlaylistError("Önce bir playlist seçin"); return; }
    setImporting(true);
    setPlaylistError("");
    setImportResult("");
    try {
      const res = await fetch("/api/admin/playlist/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlist_url: playlistUrl.trim(),
          ...(importAsNew
            ? { new_playlist: true, new_playlist_name: newListName.trim() || undefined }
            : { playlist_id: targetId }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlaylistError(data.error ?? "İçe aktarılamadı");
        return;
      }
      setImportResult(
        `${data.added} şarkı eklendi${data.skipped ? `, ${data.skipped} şarkı zaten vardı` : ""}` +
          (data.resolved_suggestions ? `, ${data.resolved_suggestions} müşteri önerisi karşılandı` : "")
      );
      setPlaylistUrl("");
      if (venueDbId) await fetchAll(venueDbId);
      if (data.playlist_id) {
        setSelectedId(data.playlist_id);
        setTargetId(data.playlist_id);
        setImportAsNew(false);
      }
    } catch {
      setPlaylistError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setImporting(false);
    }
  };

  const tabStyle = (selected: boolean) => ({
    background: selected ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${selected ? "rgba(233,30,140,0.5)" : "rgba(255,255,255,0.08)"}`,
    color: selected ? "#f9a8d4" : "#9ca3af",
  });

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-white font-bold text-2xl">Playlist</h1>
        <div className="flex items-center gap-2">
          <button onClick={openPlaylistModal} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#FF0000", color: "white" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
            İçe Aktar
          </button>
          <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#e91e8c", color: "white" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
            Şarkı Ekle
          </button>
        </div>
      </div>

      {/* Şu an otomatik çalan repertuvar */}
      <p className="text-xs mb-4" style={{ color: activeLists.length ? "#22c55e" : "#f59e0b" }}>
        {activeLists.length
          ? `Sıra boşken çalan: ${activeLists.map((p) => p.name).join(", ")}`
          : "Aktif playlist yok — sıra boşken tüm katalogdan rastgele çalınır"}
      </p>

      {/* Liste sekmeleri */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setSelectedId(ALL)} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={tabStyle(viewId === ALL)}>
          Tümü ({songs.length})
        </button>
        {playlists.map((p) => (
          <button key={p.id} onClick={() => setSelectedId(p.id)} className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5" style={tabStyle(viewId === p.id)}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.is_active ? "#22c55e" : "rgba(255,255,255,0.2)" }} />
            {p.name} ({countFor(p.id)})
          </button>
        ))}
        <button
          onClick={() => { setNewListName(""); setListError(""); setShowNewListModal(true); }}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.2)", color: "#9ca3af" }}
        >
          + Yeni Liste
        </button>
      </div>

      {/* Seçili listenin araç çubuğu */}
      {selectedList ? (
        <div className="rounded-2xl border border-white/10 px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">{selectedList.name}</p>
            <p className="text-[#6b7280] text-xs">
              {selectedList.is_active
                ? "Aktif — sıra boşken bu listedeki şarkılar çalar"
                : "Pasif — şarkıları müşteri yine de seçebilir, otomatik çalmaz"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => toggleActive(selectedList)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
              style={{
                background: selectedList.is_active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                color: selectedList.is_active ? "#22c55e" : "#9ca3af",
              }}
            >
              {selectedList.is_active ? "Aktif" : "Pasif"}
            </button>
            <button
              onClick={() => { setRenaming(selectedList); setNewListName(selectedList.name); setListError(""); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: "rgba(255,255,255,0.08)" }}
              title="Yeniden adlandır"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#9ca3af" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            </button>
            <button
              onClick={() => deleteList(selectedList)}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: "rgba(239,68,68,0.1)" }}
              title="Listeyi sil"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[#6b7280] text-xs mb-4">
          Mekanın tüm şarkıları. Müşteriler hangi liste aktif olursa olsun bu havuzun tamamından seçebilir.
        </p>
      )}

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {visibleSongs.length === 0 ? (
          <div className="py-10 text-center text-[#6b7280] text-sm">
            {selectedList ? "Bu listede henüz şarkı yok" : "Henüz şarkı yok"}
          </div>
        ) : (
          visibleSongs.map((song, i) => (
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
                <p className="text-[#6b7280] text-xs truncate">
                  {song.artist} {song.duration_ms ? `· ${formatDur(song.duration_ms)}` : ""} · {song.play_count} çalınma
                  {viewId === ALL && (memberships[song.id] ?? []).length > 0
                    ? ` · ${(memberships[song.id] ?? [])
                        .map((id) => playlists.find((p) => p.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                </p>
              </div>
              <button
                onClick={() => toggleInList(song.venueSongId, song.in_venue_list)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium shrink-0 transition-all"
                style={{ background: song.in_venue_list ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.08)", color: song.in_venue_list ? "#22c55e" : "#9ca3af" }}
                title={song.in_venue_list ? "Müşteri panelinde görünüyor" : "Müşteriden gizli — otomatik de çalmaz"}
              >
                {song.in_venue_list ? "Görünür" : "Gizli"}
              </button>
              <button
                onClick={() => removeSong(song)}
                className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
                style={{ background: "rgba(239,68,68,0.1)" }}
                title={selectedList ? "Bu listeden çıkar" : "Mekandan tamamen kaldır"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Yeni liste / yeniden adlandırma */}
      {(showNewListModal || renaming) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowNewListModal(false); setRenaming(null); }} />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6" style={{ background: "#1a1025" }}>
            <h3 className="text-white font-semibold mb-4">{renaming ? "Listeyi Yeniden Adlandır" : "Yeni Playlist"}</h3>
            {listError && (
              <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{listError}</p>
            )}
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (renaming ? renameList() : createList())}
              placeholder="Örn. Akşam Seti"
              maxLength={40}
              autoFocus
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <button
              onClick={renaming ? renameList : createList}
              disabled={savingList || !newListName.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "#e91e8c", color: "white" }}
            >
              {renaming ? "Kaydet" : "Oluştur"}
            </button>
          </div>
        </div>
      )}

      {/* YouTube Playlist Import Modal */}
      {showPlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={closePlaylistModal} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 p-6" style={{ background: "#1a1025" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">YouTube Playlist&apos;i İçe Aktar</h3>
              <button onClick={closePlaylistModal} className="text-[#6b7280] hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            <p className="text-[#9ca3af] text-xs mb-3">
              Herkese açık bir YouTube playlist bağlantısı yapıştırın — hesap bağlamaya gerek yok.
            </p>

            {importResult && (
              <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>{importResult}</p>
            )}
            {playlistError && (
              <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{playlistError}</p>
            )}

            <input
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && importPlaylist()}
              placeholder="https://www.youtube.com/playlist?list=..."
              autoFocus
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />

            <p className="text-[#6b7280] text-xs mb-2">Nereye eklensin?</p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setImportAsNew(false)}
                disabled={playlists.length === 0}
                className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                style={tabStyle(!importAsNew)}
              >
                Mevcut liste
              </button>
              <button onClick={() => setImportAsNew(true)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={tabStyle(importAsNew)}>
                Yeni liste
              </button>
            </div>

            {importAsNew ? (
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Liste adı (boş bırakılırsa YouTube başlığı)"
                maxLength={40}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            ) : (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {playlists.map((p) => (
                  <option key={p.id} value={p.id} style={{ background: "#1a1025" }}>{p.name}</option>
                ))}
              </select>
            )}

            <button
              onClick={importPlaylist}
              disabled={importing || !playlistUrl.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "#e91e8c", color: "white" }}
            >
              {importing ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
                  İçe aktarılıyor...
                </>
              ) : (
                "İçe Aktar"
              )}
            </button>
          </div>
        </div>
      )}

      {/* YouTube Search Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeModal} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 p-6 flex flex-col max-h-[80vh]" style={{ background: "#1a1025" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Şarkı Ara</h3>
              <button onClick={closeModal} className="text-[#6b7280] hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            {playlists.length === 0 ? (
              <p className="text-[#f59e0b] text-xs mb-4">Önce bir playlist oluşturun.</p>
            ) : (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {playlists.map((p) => (
                  <option key={p.id} value={p.id} style={{ background: "#1a1025" }}>{p.name} listesine ekle</option>
                ))}
              </select>
            )}

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
                <div key={track.youtube_video_id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
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
                    onClick={() => addTrack(track)}
                    disabled={addingId === track.youtube_video_id || !targetId}
                    className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 disabled:opacity-50"
                    style={{ background: "rgba(233,30,140,0.15)" }}
                  >
                    {addingId === track.youtube_video_id ? (
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
