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
  // Sıralı modda liste İÇİNDEKİ sıra yerine rastgele çalar (0032)
  shuffle: boolean;
};

// Rotasyon imleci: hangi listedeyiz ve kaçıncı turdayız (0032)
type Rotation = { playlist_id: string | null; cycle: number };

// YouTube'dan içe aktarılmış listelerde bulunur (bkz. 0029). Günlük cron kaynağı
// yoklayıp yeni şarkıları ekler; listeden çıkarılanlar PMJ'den silinmez.
type PlaylistSource = {
  playlist_id: string;
  youtube_playlist_id: string;
  auto_sync: boolean;
  last_synced_at: string | null;
  last_added: number;
  last_error: string | null;
};

type SearchTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
  duration_ms: number;
};

const ALL = "all";

// Liste kapağı: Spotify'daki gibi listenin ilk şarkılarının kapaklarından üretilir.
// 4+ kapak varsa 2x2 mozaik, azsa tek görsel, hiç yoksa nota rozeti.
function ListCover({ covers, size, rounded = "rounded-lg" }: { covers: string[]; size: number; rounded?: string }) {
  const base = `${rounded} overflow-hidden shrink-0`;

  if (covers.length >= 4) {
    const half = Math.round(size / 2);
    return (
      <div className={`${base} grid grid-cols-2 grid-rows-2`} style={{ width: size, height: size }}>
        {covers.slice(0, 4).map((url, i) => (
          <Image key={`${url}-${i}`} src={url} alt="" width={half} height={half} className="w-full h-full object-cover" />
        ))}
      </div>
    );
  }

  if (covers.length > 0) {
    return (
      <div className={base} style={{ width: size, height: size }}>
        <Image src={covers[0]} alt="" width={size} height={size} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`${base} flex items-center justify-center`}
      style={{ width: size, height: size, background: "linear-gradient(135deg, rgba(233,30,140,0.35), rgba(88,28,135,0.5))" }}
    >
      <svg width={Math.round(size * 0.42)} height={Math.round(size * 0.42)} viewBox="0 0 24 24" fill="none">
        <path d="M9 18V5l12-2v13" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="6" cy="18" r="3" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
      </svg>
    </div>
  );
}

export default function PlaylistPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PlaylistPageContent params={params} />
    </Suspense>
  );
}

function PlaylistPageContent({ params }: Props) {
  const { venueId } = use(params);
  // Dışarıdan ?list=... ile gelindiğinde ilgili liste seçili başlar
  const initialListId = useSearchParams().get("list") ?? ALL;
  const [venueDbId, setVenueDbId] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  // song_id -> üyesi olduğu playlist id'leri
  const [memberships, setMemberships] = useState<Record<string, string[]>>({});
  // playlist_id -> (song_id -> liste içi sıra). Liste görünümü bu sırayla dizilir.
  const [positions, setPositions] = useState<Record<string, Record<string, number>>>({});
  const [sourceByList, setSourceByList] = useState<Record<string, PlaylistSource>>({});
  const [selectedId, setSelectedId] = useState<string>(initialListId);
  const [loading, setLoading] = useState(true);

  const [rotation, setRotation] = useState<Rotation | null>(null);
  // playlist_id -> bu turda tüketilmiş şarkı sayısı (ilerleme göstergesi)
  const [consumed, setConsumed] = useState<Record<string, number>>({});
  const [reordering, setReordering] = useState(false);

  // Katalogdaki şarkı araması
  const [query, setQuery] = useState("");
  // Sol raydaki liste adı araması
  const [listQuery, setListQuery] = useState("");

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
  // Günlük otomatik güncelleme: YouTube listesine sonradan eklenen şarkılar
  // kendiliğinden gelsin. Varsayılan açık — içe aktaran mekan genelde bunu ister.
  const [autoSync, setAutoSync] = useState(true);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState("");

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

    const [catalog, lists, members, sources, rotationRow] = await Promise.all([
      supabase
        .from("venue_songs")
        .select("id, play_count, in_venue_list, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueDbIdArg)
        .order("added_at", { ascending: false }),
      supabase
        .from("playlists")
        .select("id, name, is_active, sort_order, shuffle")
        .eq("venue_id", venueDbIdArg)
        .order("sort_order", { ascending: true }),
      supabase
        .from("playlist_songs")
        .select("playlist_id, song_id, position")
        .eq("venue_id", venueDbIdArg)
        .order("position", { ascending: true }),
      supabase
        .from("playlist_sources")
        .select("playlist_id, youtube_playlist_id, auto_sync, last_synced_at, last_added, last_error")
        .eq("venue_id", venueDbIdArg),
      supabase
        .from("playlist_rotation")
        .select("playlist_id, cycle")
        .eq("venue_id", venueDbIdArg)
        .maybeSingle(),
    ]);

    const rot = (rotationRow.data as Rotation | null) ?? null;
    setRotation(rot);

    // Bu turda hangi listeden kaç şarkı çalındı — ilerleme göstergesi
    const { data: consumedRows } = await supabase
      .from("playlist_rotation_consumed")
      .select("playlist_id")
      .eq("venue_id", venueDbIdArg)
      .eq("cycle", rot?.cycle ?? 1);

    const counts: Record<string, number> = {};
    for (const row of (consumedRows ?? []) as { playlist_id: string }[]) {
      counts[row.playlist_id] = (counts[row.playlist_id] ?? 0) + 1;
    }
    setConsumed(counts);

    if (catalog.data) {
      const rows = catalog.data as unknown as VenueSongRow[];
      setSongs(
        rows
          .filter((vs) => vs.songs)
          .map((vs) => ({ ...vs.songs!, venueSongId: vs.id, play_count: vs.play_count, in_venue_list: vs.in_venue_list }))
      );
    }
    if (lists.data) setPlaylists(lists.data as Playlist[]);
    if (sources.data) {
      setSourceByList(
        Object.fromEntries((sources.data as PlaylistSource[]).map((s) => [s.playlist_id, s]))
      );
    }
    if (members.data) {
      const map: Record<string, string[]> = {};
      const order: Record<string, Record<string, number>> = {};
      for (const m of members.data as { playlist_id: string; song_id: string; position: number }[]) {
        (map[m.song_id] ??= []).push(m.playlist_id);
        (order[m.playlist_id] ??= {})[m.song_id] = m.position;
      }
      setMemberships(map);
      setPositions(order);
    }
    setLoading(false);
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
        .on("postgres_changes", { event: "*", schema: "public", table: "playlist_sources", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        // Sıralı moddaki "şu an çalan liste — 12/40" göstergesi her dolumda tazelensin
        .on("postgres_changes", { event: "*", schema: "public", table: "playlist_rotation", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        .subscribe();
    };
    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId, supabase, fetchAll]);

  const activeLists = useMemo(() => playlists.filter((p) => p.is_active), [playlists]);

  // Şu an hangi listeden çalınıyor. İmleçteki liste pasife alınmış ya da
  // silinmişse sunucu da ilk aktif listeye düşeceği için burada da öyle.
  const currentList = useMemo(() => {
    const pointed = activeLists.find((p) => p.id === rotation?.playlist_id);
    return pointed ?? activeLists[0] ?? null;
  }, [activeLists, rotation]);
  const selectedList = useMemo(
    () => playlists.find((p) => p.id === selectedId) ?? null,
    [playlists, selectedId]
  );

  // Seçilen liste silinirse (ya da veri henüz gelmediyse) görünüm "Tümü"ne düşer
  const viewId = selectedList ? selectedId : ALL;
  const selectedSource = selectedList ? sourceByList[selectedList.id] : undefined;

  const countFor = useCallback(
    (playlistId: string) =>
      songs.reduce((n, s) => n + ((memberships[s.id] ?? []).includes(playlistId) ? 1 : 0), 0),
    [songs, memberships]
  );

  // playlist_id -> kapak için ilk 4 şarkı görseli (liste içi sıraya göre)
  const coversByList = useMemo(() => {
    const buckets: Record<string, { pos: number; url: string }[]> = {};
    for (const song of songs) {
      if (!song.album_cover_url) continue;
      for (const pid of memberships[song.id] ?? []) {
        (buckets[pid] ??= []).push({ pos: positions[pid]?.[song.id] ?? 0, url: song.album_cover_url });
      }
    }
    const out: Record<string, string[]> = {};
    for (const [pid, items] of Object.entries(buckets)) {
      out[pid] = items.sort((a, b) => a.pos - b.pos).slice(0, 4).map((i) => i.url);
    }
    return out;
  }, [songs, memberships, positions]);

  // "Tüm Şarkılar" kutusunun kapağı: katalogun en son eklenen şarkıları
  const catalogCovers = useMemo(
    () => songs.map((s) => s.album_cover_url).filter((url): url is string => Boolean(url)).slice(0, 4),
    [songs]
  );

  const normalize = (value: string) => value.toLocaleLowerCase("tr");
  const q = normalize(query.trim());
  const filtering = q.length > 0;

  const matchesQuery = useCallback(
    (song: Song) => !q || normalize(song.title).includes(q) || normalize(song.artist ?? "").includes(q),
    [q]
  );

  // Aramada her listenin kaç eşleşmesi olduğunu yan rayda göstermek için
  const matchCountFor = useCallback(
    (playlistId: string) =>
      songs.reduce(
        (n, s) => n + ((memberships[s.id] ?? []).includes(playlistId) && matchesQuery(s) ? 1 : 0),
        0
      ),
    [songs, memberships, matchesQuery]
  );

  // Raydaki listeler: ad araması süzer, seçili liste her zaman görünür kalır
  const listQ = normalize(listQuery.trim());
  const visiblePlaylists = useMemo(() => {
    if (!listQ) return playlists;
    return playlists.filter((p) => normalize(p.name).includes(listQ) || p.id === viewId);
  }, [playlists, listQ, viewId]);

  const visibleSongs = useMemo(() => {
    if (viewId === ALL) {
      return q ? songs.filter(matchesQuery) : songs;
    }
    // Liste görünümü: katalog sırası değil, listenin kendi çalma sırası
    const order = positions[viewId] ?? {};
    const inView = songs
      .filter((s) => (memberships[s.id] ?? []).includes(viewId))
      .sort((a, b) => (order[a.id] ?? 0) - (order[b.id] ?? 0));
    return q ? inView.filter(matchesQuery) : inView;
  }, [songs, memberships, positions, viewId, q, matchesQuery]);

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

  // Listeyi bir yukarı/aşağı taşır. Sıra sunucuda dizinin kendisi olarak yazılır;
  // çalan listenin imleci korunur, yani sıra değiştirmek turu başa sarmaz.
  const moveList = async (playlist: Playlist, delta: -1 | 1) => {
    if (reordering) return;
    const ordered = [...playlists].sort((a, b) => a.sort_order - b.sort_order);
    const from = ordered.findIndex((p) => p.id === playlist.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ordered.length) return;

    const next = [...ordered];
    [next[from], next[to]] = [next[to], next[from]];
    const withOrder = next.map((p, i) => ({ ...p, sort_order: i }));
    setPlaylists(withOrder);
    setReordering(true);

    try {
      const res = await fetch("/api/admin/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: withOrder.map((p) => p.id) }),
      });
      if (!res.ok) setPlaylists(ordered);
    } catch {
      setPlaylists(ordered);
    } finally {
      setReordering(false);
    }
  };

  // Liste içi çalma sırası: eklenme sırası mı, rastgele mi. Değişince bekleyen
  // otomatik şarkılar da yeni düzene göre yeniden seçilir (API tarafında).
  const setShuffle = async (playlist: Playlist, next: boolean) => {
    if (playlist.shuffle === next) return;
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, shuffle: next } : p)));
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, shuffle: next }),
    });
    if (!res.ok) {
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, shuffle: !next } : p)));
      return;
    }
    if (venueDbId) await fetchAll(venueDbId);
  };

  // Günlük senkron anahtarı. Yalnızca YouTube'dan içe aktarılmış listelerde var —
  // playlist_sources satırı yoksa API 400 döner, o yüzden buton da gösterilmez.
  const toggleAutoSync = async (playlist: Playlist) => {
    const source = sourceByList[playlist.id];
    if (!source) return;
    const next = !source.auto_sync;
    setSourceByList((prev) => ({ ...prev, [playlist.id]: { ...source, auto_sync: next } }));

    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, auto_sync: next }),
    });
    if (!res.ok) {
      setSourceByList((prev) => ({ ...prev, [playlist.id]: { ...source, auto_sync: !next } }));
    }
  };

  const syncNow = async (playlist: Playlist) => {
    if (syncingId) return;
    setSyncingId(playlist.id);
    setSyncNote("");
    try {
      const res = await fetch("/api/admin/playlist/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: playlist.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncNote(data.error ?? "Güncellenemedi");
        return;
      }
      setSyncNote(
        data.added > 0
          ? `"${playlist.name}" listesine ${data.added} yeni şarkı eklendi`
          : `"${playlist.name}" zaten güncel`
      );
      if (venueDbId) await fetchAll(venueDbId);
    } catch {
      setSyncNote("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSyncingId(null);
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

  const doSearch = async (value: string) => {
    if (!value.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
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
    // İçe aktarma çoğunlukla yeni bir liste oluşturmak için yapılıyor —
    // varsayılan sekme "Yeni liste".
    setImportAsNew(true);
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
          auto_sync: autoSync,
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
          (data.resolved_suggestions ? `, ${data.resolved_suggestions} müşteri önerisi karşılandı` : "") +
          (data.auto_sync ? ". Otomatik güncelleme açık — yeni şarkılar her gün eklenecek." : "")
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

  const railStyle = (selected: boolean, dim: boolean) => ({
    background: selected ? "rgba(233,30,140,0.12)" : "rgba(255,255,255,0.02)",
    border: `1px solid ${selected ? "rgba(233,30,140,0.45)" : "rgba(255,255,255,0.07)"}`,
    opacity: dim ? 0.45 : 1,
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-white font-bold text-2xl">Playlist</h1>
          <p className="text-xs mt-1" style={{ color: activeLists.length ? "#22c55e" : "#f59e0b" }}>
            {!activeLists.length
              ? "Aktif playlist yok — sıra boşken tüm katalogdan rastgele çalınır"
              : `Sırada: ${activeLists.map((p) => p.name).join(" → ")}${
                  currentList ? ` · Şu an ${currentList.name}` : ""
                }`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openPlaylistModal} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#FF0000", color: "white" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
            Playlist Ekle
          </button>
          <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#e91e8c", color: "white" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
            Şarkı Ekle
          </button>
        </div>
      </div>

      {/* Katalog araması — hem listeleri hem şarkıları süzer */}
      <div className="relative mb-4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute left-3.5 top-1/2 -translate-y-1/2">
          <circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Katalogda şarkı veya sanatçı ara..."
          className="w-full rounded-xl pl-10 pr-10 py-2.5 text-sm text-white outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
            title="Aramayı temizle"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>

      {syncNote && (
        <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
          {syncNote}
        </p>
      )}

      {/* Düzenin özeti: listeler hep sırayla çalar, sıra oklarla değiştirilir */}
      <div
        className="rounded-2xl border border-white/10 px-4 py-3 mb-4"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <p className="text-white text-sm font-semibold">Otomatik çalma düzeni</p>
        <p className="text-[#6b7280] text-xs mt-0.5">
          Aktif listeler yukarıdan aşağıya sırayla çalar; biri bitmeden diğerine geçilmez. Sırayı
          soldaki oklarla değiştirin. Müşterilerin jetonla eklediği şarkılar her zaman öncelikli çalar.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr] items-start">
        {/* Sol ray: listeler. Mobilde yatay kaydırılan şeritler. */}
        <div className="flex flex-col gap-2 lg:sticky lg:top-4">
          {/* Liste araması — playlist'ler arasında ada göre süzer */}
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2">
              <circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Playlist ara..."
              className="w-full rounded-xl pl-9 pr-9 py-2 text-xs text-white outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            {listQuery && (
              <button
                onClick={() => setListQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
                title="Aramayı temizle"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            )}
          </div>

          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            <button
              onClick={() => setSelectedId(ALL)}
              className="text-left rounded-2xl px-3.5 py-3 shrink-0 min-w-[180px] lg:min-w-0 transition-all flex items-center gap-3"
              style={railStyle(viewId === ALL, false)}
            >
              <ListCover covers={catalogCovers} size={40} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: viewId === ALL ? "#f9a8d4" : "#e5e7eb" }}>
                  Tüm Şarkılar
                </p>
                <p className="text-[#6b7280] text-[11px] mt-0.5">
                  {songs.length} şarkı
                  {filtering ? ` · ${songs.filter(matchesQuery).length} eşleşme` : ""}
                </p>
              </div>
            </button>

            {visiblePlaylists.map((p, railIndex) => {
              const total = countFor(p.id);
              const matches = filtering ? matchCountFor(p.id) : total;
              const source = sourceByList[p.id];
              // Çalma sırası yalnızca aktif listeler üzerinden numaralanır;
              // pasif listelerin sırada yeri yoktur.
              const turn = p.is_active ? activeLists.findIndex((a) => a.id === p.id) + 1 : 0;
              const isCurrent = currentList?.id === p.id;
              const done = consumed[p.id] ?? 0;

              return (
                <div
                  key={p.id}
                  className="rounded-2xl shrink-0 min-w-[180px] lg:min-w-0 transition-all flex items-stretch"
                  style={railStyle(viewId === p.id, filtering && matches === 0)}
                >
                  <button
                    onClick={() => setSelectedId(p.id)}
                    className="text-left px-3.5 py-3 flex-1 min-w-0 flex items-center gap-3"
                  >
                    <ListCover covers={coversByList[p.id] ?? []} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {turn > 0 ? (
                          <span
                            className="w-4 h-4 rounded-md shrink-0 text-[10px] font-bold flex items-center justify-center"
                            style={{
                              background: isCurrent ? "#22c55e" : "rgba(34,197,94,0.15)",
                              color: isCurrent ? "#0b1220" : "#22c55e",
                            }}
                            title={isCurrent ? "Şu an bu liste çalıyor" : `Çalma sırası: ${turn}`}
                          >
                            {turn}
                          </span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.is_active ? "#22c55e" : "rgba(255,255,255,0.2)" }} />
                        )}
                        <p className="text-sm font-semibold truncate" style={{ color: viewId === p.id ? "#f9a8d4" : "#e5e7eb" }}>
                          {p.name}
                        </p>
                        {source && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0 ml-auto">
                            <path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke={source.last_error ? "#f87171" : source.auto_sync ? "#FF0000" : "#4b5563"} strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      <p className="text-[#6b7280] text-[11px] mt-0.5">
                        {total} şarkı
                        {filtering
                          ? ` · ${matches} eşleşme`
                          : isCurrent
                            ? ` · Çalıyor ${done}/${total}`
                            : ` · ${p.is_active ? "Aktif" : "Pasif"}`}
                      </p>
                    </div>
                  </button>

                  {/* Listelerin çalma sırası buradan değiştirilir */}
                  {!listQ && (
                    <div className="flex flex-col justify-center gap-1 pr-2 py-2 shrink-0">
                      <button
                        onClick={() => moveList(p, -1)}
                        disabled={reordering || railIndex === 0}
                        className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                        title="Yukarı taşı"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <button
                        onClick={() => moveList(p, 1)}
                        disabled={reordering || railIndex === visiblePlaylists.length - 1}
                        className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                        title="Aşağı taşı"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => { setNewListName(""); setListError(""); setShowNewListModal(true); }}
              className="rounded-2xl px-3.5 py-3 text-sm font-semibold shrink-0 min-w-[140px] lg:min-w-0"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.2)", color: "#9ca3af" }}
            >
              + Yeni Liste
            </button>
          </div>

          {listQ && visiblePlaylists.length === 0 && (
            <p className="text-[#6b7280] text-[11px] px-1">Eşleşen playlist yok</p>
          )}
        </div>

        {/* Sağ pano: seçili görünümün başlığı, araçları ve şarkıları */}
        <div className="min-w-0">
          <div className="rounded-2xl border border-white/10 px-4 py-3 mb-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="min-w-0 flex items-start gap-3">
              <ListCover
                covers={selectedList ? coversByList[selectedList.id] ?? [] : catalogCovers}
                size={56}
                rounded="rounded-xl"
              />
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {selectedList ? selectedList.name : "Tüm Şarkılar"}
                </p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  {!selectedList
                    ? "Mekanın tüm şarkıları. Müşteriler hangi liste aktif olursa olsun bu havuzun tamamından seçebilir."
                    : !selectedList.is_active
                      ? "Pasif — şarkıları müşteri yine de seçebilir, otomatik çalmaz"
                      : currentList?.id === selectedList.id
                        ? `Şu an çalıyor — bu turda ${consumed[selectedList.id] ?? 0}/${countFor(selectedList.id)} şarkı çalındı`
                        : `Sırada ${activeLists.findIndex((a) => a.id === selectedList.id) + 1}. — kendinden öncekiler bitince başlar`}
                </p>
                {selectedSource && (
                  <p className="text-[11px] mt-1 flex items-center gap-1.5 flex-wrap">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      <path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke="#FF0000" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span style={{ color: selectedSource.last_error ? "#f87171" : selectedSource.auto_sync ? "#22c55e" : "#6b7280" }}>
                      {selectedSource.last_error
                        ? `Senkron hatası: ${selectedSource.last_error}`
                        : selectedSource.auto_sync
                          ? "Her gün otomatik güncelleniyor"
                          : "Otomatik güncelleme kapalı"}
                    </span>
                    {selectedSource.last_synced_at && !selectedSource.last_error && (
                      <span className="text-[#4b5563]">
                        · Son: {new Date(selectedSource.last_synced_at).toLocaleDateString("tr-TR")}
                        {selectedSource.last_added > 0 ? ` (+${selectedSource.last_added})` : ""}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {selectedList && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(selectedList)}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                  style={{
                    background: selectedList.is_active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                    color: selectedList.is_active ? "#22c55e" : "#9ca3af",
                  }}
                  title={selectedList.is_active
                    ? "Sıra boşken bu listedeki şarkılar çalar"
                    : "Pasif — müşteri yine seçebilir, otomatik çalmaz"}
                >
                  {selectedList.is_active ? "Aktif" : "Pasif"}
                </button>
                {/* Liste İÇİNDEKİ şarkıların sırası: eklenme sırası mı, rastgele mi */}
                <div className="flex rounded-lg p-0.5 shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <button
                    onClick={() => setShuffle(selectedList, false)}
                    className="text-xs px-3 py-1 rounded-md font-semibold transition-all"
                    style={{
                      background: selectedList.shuffle ? "transparent" : "rgba(233,30,140,0.2)",
                      color: selectedList.shuffle ? "#9ca3af" : "#f9a8d4",
                    }}
                    title="Listedeki şarkılar aşağıdaki sırayla çalar"
                  >
                    Sıralı
                  </button>
                  <button
                    onClick={() => setShuffle(selectedList, true)}
                    className="text-xs px-3 py-1 rounded-md font-semibold transition-all"
                    style={{
                      background: selectedList.shuffle ? "rgba(233,30,140,0.2)" : "transparent",
                      color: selectedList.shuffle ? "#f9a8d4" : "#9ca3af",
                    }}
                    title="Listedeki şarkılar rastgele sırayla çalar"
                  >
                    Karışık
                  </button>
                </div>
                {selectedSource && (
                  <>
                    <button
                      onClick={() => toggleAutoSync(selectedList)}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                      style={{
                        background: selectedSource.auto_sync ? "rgba(255,0,0,0.12)" : "rgba(255,255,255,0.08)",
                        color: selectedSource.auto_sync ? "#fca5a5" : "#9ca3af",
                      }}
                      title={selectedSource.auto_sync
                        ? "YouTube listesine eklenen yeni şarkılar her gün buraya da eklenir"
                        : "Otomatik güncelleme kapalı — liste olduğu gibi kalır"}
                    >
                      {selectedSource.auto_sync ? "Senkron açık" : "Senkron kapalı"}
                    </button>
                    <button
                      onClick={() => syncNow(selectedList)}
                      disabled={syncingId !== null}
                      className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                      title="YouTube'dan şimdi güncelle"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={syncingId === selectedList.id ? "animate-spin" : ""}>
                        <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </>
                )}
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
            )}
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            {loading ? (
              <div className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor...</div>
            ) : visibleSongs.length === 0 ? (
              <div className="py-10 text-center text-[#6b7280] text-sm">
                {filtering
                  ? "Eşleşen şarkı yok"
                  : selectedList
                    ? "Bu listede henüz şarkı yok"
                    : "Henüz şarkı yok"}
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
        </div>
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

            {/* Günlük senkron: YouTube listesine sonradan eklenen şarkılar
                kendiliğinden gelir. Silinenler PMJ'den düşmez — mekanın elle
                yaptığı düzenlemeler korunur. */}
            <button
              onClick={() => setAutoSync((v) => !v)}
              className="w-full flex items-start gap-3 rounded-xl px-3.5 py-3 mb-3 text-left"
              style={{
                background: autoSync ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${autoSync ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <span
                className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center"
                style={{
                  background: autoSync ? "#22c55e" : "transparent",
                  border: `1.5px solid ${autoSync ? "#22c55e" : "rgba(255,255,255,0.25)"}`,
                }}
              >
                {autoSync && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M4 12l5 5L20 6" stroke="#0b0710" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-white text-xs font-semibold">Her gün otomatik güncelle</span>
                <span className="block text-[#6b7280] text-[11px] mt-0.5">
                  YouTube listesine yeni şarkı eklendiğinde buraya da eklenir. Listeden
                  çıkarılanlar silinmez.
                </span>
              </span>
            </button>

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
