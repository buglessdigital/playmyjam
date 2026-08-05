"use client";

import { useState, useEffect, useMemo, useCallback, use, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Playlist = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

type PlaylistSong = {
  id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
};

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

// Playlist'lerin toplu görünümü: /playlist ekranı tek listeyi düzenlemek için,
// burası "hangi listeler var, içlerinde ne var" sorusu için.
export default function PlaylistsPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PlaylistsPageContent params={params} />
    </Suspense>
  );
}

function PlaylistsPageContent({ params }: Props) {
  const { venueId } = use(params);
  const [venueDbId, setVenueDbId] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  // playlist_id -> şarkılar
  const [songsByList, setSongsByList] = useState<Record<string, PlaylistSong[]>>({});
  const [sourceByList, setSourceByList] = useState<Record<string, PlaylistSource>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState("");
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showNewListModal, setShowNewListModal] = useState(false);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [newListName, setNewListName] = useState("");
  const [listError, setListError] = useState("");
  const [savingList, setSavingList] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchAll = useCallback(
    async (venueDbIdArg: string) => {
      type MemberRow = {
        playlist_id: string;
        songs: PlaylistSong | null;
      };

      const [lists, members, sources] = await Promise.all([
        supabase
          .from("playlists")
          .select("id, name, is_active, sort_order")
          .eq("venue_id", venueDbIdArg)
          .order("sort_order", { ascending: true }),
        supabase
          .from("playlist_songs")
          .select("playlist_id, songs(id, title, artist, album_cover_url)")
          .eq("venue_id", venueDbIdArg)
          .order("added_at", { ascending: false }),
        supabase
          .from("playlist_sources")
          .select("playlist_id, youtube_playlist_id, auto_sync, last_synced_at, last_added, last_error")
          .eq("venue_id", venueDbIdArg),
      ]);

      if (lists.data) setPlaylists(lists.data as Playlist[]);
      if (sources.data) {
        setSourceByList(
          Object.fromEntries((sources.data as PlaylistSource[]).map((s) => [s.playlist_id, s]))
        );
      }
      if (members.data) {
        const map: Record<string, PlaylistSong[]> = {};
        for (const m of members.data as unknown as MemberRow[]) {
          if (!m.songs) continue;
          (map[m.playlist_id] ??= []).push(m.songs);
        }
        setSongsByList(map);
      }
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { data: venue } = await supabase.from("venues").select("id").eq("slug", venueId).single();
      if (cancelled || !venue) return;
      setVenueDbId(venue.id);

      await fetchAll(venue.id);

      channel = supabase
        .channel(`venue_playlists_overview:${venue.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "playlists", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        .on("postgres_changes", { event: "*", schema: "public", table: "playlist_songs", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        .on("postgres_changes", { event: "*", schema: "public", table: "playlist_sources", filter: `venue_id=eq.${venue.id}` }, () => fetchAll(venue.id))
        .subscribe();
    };
    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId, supabase, fetchAll]);

  const normalize = (value: string) => value.toLocaleLowerCase("tr");

  // Arama hem liste adında hem içindeki şarkılarda geçer: "rock" yazınca hem
  // "Rock Seti" listesi, hem içinde eşleşen şarkı olan listeler kalır.
  const results = useMemo(() => {
    const q = normalize(query.trim());
    return playlists.map((p) => {
      const songs = songsByList[p.id] ?? [];
      if (!q) return { playlist: p, songs, matchedSongs: [] as PlaylistSong[], nameMatch: false, visible: true };

      const nameMatch = normalize(p.name).includes(q);
      const matchedSongs = songs.filter(
        (s) => normalize(s.title).includes(q) || normalize(s.artist ?? "").includes(q)
      );
      return { playlist: p, songs, matchedSongs, nameMatch, visible: nameMatch || matchedSongs.length > 0 };
    });
  }, [playlists, songsByList, query]);

  const visible = useMemo(() => results.filter((r) => r.visible), [results]);
  const searching = query.trim().length > 0;
  const totalMatchedSongs = useMemo(
    () => visible.reduce((n, r) => n + r.matchedSongs.length, 0),
    [visible]
  );

  const toggleActive = async (playlist: Playlist) => {
    const next = !playlist.is_active;
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, is_active: next } : p)));
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, is_active: next }),
    });
    if (!res.ok) {
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, is_active: !next } : p)));
    }
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
      if (!res.ok) {
        setListError(data.error ?? "Oluşturulamadı");
        return;
      }
      setPlaylists((prev) => [...prev, data.playlist as Playlist]);
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
      if (!res.ok) {
        setListError(data.error ?? "Kaydedilemedi");
        return;
      }
      setPlaylists((prev) => prev.map((p) => (p.id === renaming.id ? { ...p, name } : p)));
      setRenaming(null);
      setNewListName("");
    } catch {
      setListError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSavingList(false);
    }
  };

  const deleteList = async (playlist: Playlist) => {
    const count = (songsByList[playlist.id] ?? []).length;
    if (
      !confirm(
        `"${playlist.name}" listesi silinecek.` +
          (count ? " Yalnızca bu listede olan şarkılar mekan katalogundan da düşer." : "")
      )
    )
      return;

    const res = await fetch("/api/admin/playlists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id }),
    });
    if (res.ok && venueDbId) await fetchAll(venueDbId);
  };

  const activeCount = playlists.filter((p) => p.is_active).length;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-white font-bold text-2xl">Playlistler</h1>
        <button
          onClick={() => {
            setNewListName("");
            setListError("");
            setShowNewListModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "#e91e8c", color: "white" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          Yeni Liste
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: activeCount ? "#22c55e" : "#f59e0b" }}>
        {activeCount
          ? `${activeCount} liste aktif — sıra boşken bu listelerden çalınır`
          : "Aktif playlist yok — sıra boşken tüm katalogdan rastgele çalınır"}
      </p>

      {/* Arama: liste adı + içindeki şarkı */}
      <div className="relative mb-5">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
        >
          <circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Liste veya şarkı ara..."
          className="w-full rounded-xl pl-10 pr-10 py-2.5 text-sm text-white outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
            title="Aramayı temizle"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {syncNote && (
        <p
          className="text-sm rounded-xl px-3.5 py-2.5 mb-3"
          style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}
        >
          {syncNote}
        </p>
      )}

      {searching && (
        <p className="text-[#6b7280] text-xs mb-3">
          {visible.length} liste
          {totalMatchedSongs ? `, ${totalMatchedSongs} eşleşen şarkı` : ""}
        </p>
      )}

      {loading ? (
        <div className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 py-10 text-center text-[#6b7280] text-sm">
          {searching ? "Eşleşen liste veya şarkı yok" : "Henüz playlist yok — yeni bir liste oluşturun"}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(({ playlist, songs, matchedSongs, nameMatch }) => {
            const isOpen = expanded === playlist.id;
            const source = sourceByList[playlist.id];
            // Aramada eşleşen şarkılar öne çıkar; liste adı eşleştiyse tüm liste görünür
            const preview = searching && !nameMatch ? matchedSongs : songs;
            const shown = isOpen ? preview : preview.slice(0, 3);

            return (
              <div
                key={playlist.id}
                className="rounded-2xl border border-white/10 overflow-hidden"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: playlist.is_active ? "#22c55e" : "rgba(255,255,255,0.2)" }}
                      />
                      <p className="text-white text-sm font-semibold truncate">{playlist.name}</p>
                    </div>
                    <p className="text-[#6b7280] text-xs mt-0.5">
                      {songs.length} şarkı
                      {searching && matchedSongs.length ? ` · ${matchedSongs.length} eşleşme` : ""}
                      {" · "}
                      {playlist.is_active ? "Aktif" : "Pasif"}
                    </p>
                    {source && (
                      <p className="text-[11px] mt-1 flex items-center gap-1.5 flex-wrap">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
                          <path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke="#FF0000" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span style={{ color: source.last_error ? "#f87171" : source.auto_sync ? "#22c55e" : "#6b7280" }}>
                          {source.last_error
                            ? `Senkron hatası: ${source.last_error}`
                            : source.auto_sync
                              ? "Her gün otomatik güncelleniyor"
                              : "Otomatik güncelleme kapalı"}
                        </span>
                        {source.last_synced_at && !source.last_error && (
                          <span className="text-[#4b5563]">
                            · Son: {new Date(source.last_synced_at).toLocaleDateString("tr-TR")}
                            {source.last_added > 0 ? ` (+${source.last_added})` : ""}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(playlist)}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                      style={{
                        background: playlist.is_active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                        color: playlist.is_active ? "#22c55e" : "#9ca3af",
                      }}
                      title={
                        playlist.is_active
                          ? "Sıra boşken bu listedeki şarkılar çalar"
                          : "Pasif — müşteri yine seçebilir, otomatik çalmaz"
                      }
                    >
                      {playlist.is_active ? "Aktif" : "Pasif"}
                    </button>
                    {source && (
                      <>
                        <button
                          onClick={() => toggleAutoSync(playlist)}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                          style={{
                            background: source.auto_sync ? "rgba(255,0,0,0.12)" : "rgba(255,255,255,0.08)",
                            color: source.auto_sync ? "#fca5a5" : "#9ca3af",
                          }}
                          title={
                            source.auto_sync
                              ? "YouTube listesine eklenen yeni şarkılar her gün buraya da eklenir"
                              : "Otomatik güncelleme kapalı — liste olduğu gibi kalır"
                          }
                        >
                          {source.auto_sync ? "Senkron açık" : "Senkron kapalı"}
                        </button>
                        <button
                          onClick={() => syncNow(playlist)}
                          disabled={syncingId !== null}
                          className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40"
                          style={{ background: "rgba(255,255,255,0.08)" }}
                          title="YouTube'dan şimdi güncelle"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            className={syncingId === playlist.id ? "animate-spin" : ""}
                          >
                            <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </>
                    )}
                    <Link
                      href={`/admin/${venueId}/playlist?list=${playlist.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: "rgba(233,30,140,0.15)", color: "#f9a8d4" }}
                    >
                      Düzenle
                    </Link>
                    <button
                      onClick={() => {
                        setRenaming(playlist);
                        setNewListName(playlist.name);
                        setListError("");
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                      title="Yeniden adlandır"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#9ca3af" strokeWidth="1.8" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteList(playlist)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: "rgba(239,68,68,0.1)" }}
                      title="Listeyi sil"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {shown.length > 0 && (
                  <div className="border-t border-white/[0.06]">
                    {shown.map((song) => (
                      <div key={song.id} className="flex items-center gap-3 px-4 py-2">
                        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-white/10">
                          {song.album_cover_url ? (
                            <Image
                              src={song.album_cover_url}
                              alt=""
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                                <circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-xs font-medium truncate">{song.title}</p>
                          <p className="text-[#6b7280] text-[11px] truncate">{song.artist}</p>
                        </div>
                      </div>
                    ))}
                    {preview.length > 3 && (
                      <button
                        onClick={() => setExpanded(isOpen ? null : playlist.id)}
                        className="w-full px-4 py-2 text-xs font-semibold text-left"
                        style={{ color: "#9ca3af" }}
                      >
                        {isOpen ? "Daha az göster" : `+${preview.length - 3} şarkı daha`}
                      </button>
                    )}
                  </div>
                )}

                {shown.length === 0 && (
                  <p className="px-4 py-3 border-t border-white/[0.06] text-[#6b7280] text-xs">
                    Bu listede henüz şarkı yok
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Yeni liste / yeniden adlandırma */}
      {(showNewListModal || renaming) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              setShowNewListModal(false);
              setRenaming(null);
            }}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6" style={{ background: "#1a1025" }}>
            <h3 className="text-white font-semibold mb-4">{renaming ? "Listeyi Yeniden Adlandır" : "Yeni Playlist"}</h3>
            {listError && (
              <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                {listError}
              </p>
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
    </div>
  );
}
