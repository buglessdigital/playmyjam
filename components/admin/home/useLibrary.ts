"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Song = {
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

export type Playlist = {
  id: string;
  name: string;
  // Çalma kuyruğundaki yer; null = sırada değil (0037)
  queue_position: number | null;
  // Bir turunu bitirince kuyruktan düşer (0037)
  play_once: boolean;
  // Sırada olmayan listelerin raydaki görünüm sırası
  sort_order: number;
  // Liste İÇİNDEKİ sıra yerine rastgele çalar (0032)
  shuffle: boolean;
  // Müşteri panelinde görünür/seçilebilir mi (0040). Otomatik çalmayı etkilemez:
  // pasif liste de sırası gelince çalar.
  customer_visible: boolean;
};

// Rotasyon imleci: hangi listedeyiz ve kaçıncı turdayız (0032)
export type Rotation = { playlist_id: string | null; cycle: number };

// YouTube'dan içe aktarılmış listelerde bulunur (bkz. 0029). Günlük cron kaynağı
// yoklayıp yeni şarkıları ekler; listeden çıkarılanlar PMJ'den silinmez.
export type PlaylistSource = {
  playlist_id: string;
  youtube_playlist_id: string;
  auto_sync: boolean;
  last_synced_at: string | null;
  last_added: number;
  last_error: string | null;
};

export const ALL = "all";

export const normalize = (value: string) => value.toLocaleLowerCase("tr");

export function formatDur(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Mekan katalogu + playlist'ler: ana ekranın sol rayı ve orta panosu bunu kullanır.
 * (Eski /playlist sayfasının tüm mantığı buraya taşındı.)
 */
export function useLibrary(venueDbId: string, initialListId: string = ALL) {
  const supabase = useMemo(() => createClient(), []);

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
  const [orderError, setOrderError] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  // Henüz sunucuya gitmemiş sıra + geri dönüş noktası
  const pendingOrderRef = useRef<{ listId: string; ids: string[]; previous: Record<string, number> } | null>(null);
  const orderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Yazma sürerken gelen realtime tazelemesi ekrandaki sırayı geri almasın
  const savingOrderRef = useRef(false);

  // Katalogdaki şarkı araması
  const [query, setQuery] = useState("");
  // Sol raydaki liste adı araması
  const [listQuery, setListQuery] = useState("");

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState("");

  const fetchAll = useCallback(
    async (venueDbIdArg: string) => {
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
          .select("id, name, queue_position, play_once, sort_order, shuffle, customer_visible")
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
        setSourceByList(Object.fromEntries((sources.data as PlaylistSource[]).map((s) => [s.playlist_id, s])));
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
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    if (venueDbId) await fetchAll(venueDbId);
  }, [venueDbId, fetchAll]);

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    // Tek işlem çok satır değiştirebiliyor (içe aktarma, liste içi sıralama) —
    // her olayda değil, olay yağmuru dindikten sonra bir kez tazelenir.
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (cancelled) return;
        // Kaydedilmemiş ya da yolda olan sıra varsa tazeleme beklesin: sunucudan
        // gelen eski sıra kullanıcının ekranındaki taşımaları geri alırdı.
        if (pendingOrderRef.current || savingOrderRef.current) {
          scheduleRefresh();
          return;
        }
        fetchAll(venueDbId);
      }, 300);
    };

    const load = async () => {
      await fetchAll(venueDbId);
    };
    load();

    channel = supabase
      .channel(`venue_playlists:${venueDbId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_songs", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "playlists", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_songs", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_sources", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh)
      // Sıralı moddaki "şu an çalan liste — 12/40" göstergesi her dolumda tazelensin
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_rotation", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh)
      .subscribe();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueDbId, supabase, fetchAll]);

  // Son taşımanın ardından hemen sayfadan çıkılırsa bekleyen sıra kaybolmasın:
  // keepalive ile sayfa kapanırken de tamamlanacak bir istek yollanır.
  useEffect(() => {
    return () => {
      if (orderTimerRef.current) clearTimeout(orderTimerRef.current);
      const pending = pendingOrderRef.current;
      if (!pending) return;
      pendingOrderRef.current = null;
      fetch("/api/admin/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: pending.listId, song_order: pending.ids }),
        keepalive: true,
      }).catch(() => {});
    };
  }, []);

  // Çalma kuyruğu: sıraya alınmış listeler, çalacakları sırayla (0037)
  const queueLists = useMemo(
    () =>
      playlists
        .filter((p) => p.queue_position !== null)
        .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0)),
    [playlists]
  );

  // Şu an hangi listeden çalınıyor. İmleçteki liste kuyruktan çıkarılmış ya da
  // silinmişse sunucu da kuyruğun başına döneceği için burada da öyle.
  // Kuyruk boşsa null — o zaman tüm katalogdan karışık çalınır.
  const currentList = useMemo(() => {
    const pointed = queueLists.find((p) => p.id === rotation?.playlist_id);
    return pointed ?? queueLists[0] ?? null;
  }, [queueLists, rotation]);

  const selectedList = useMemo(
    () => playlists.find((p) => p.id === selectedId) ?? null,
    [playlists, selectedId]
  );

  // Seçilen liste silinirse (ya da veri henüz gelmediyse) görünüm "Tümü"ne düşer
  const viewId = selectedList ? selectedId : ALL;
  const selectedSource = selectedList ? sourceByList[selectedList.id] : undefined;

  const countFor = useCallback(
    (playlistId: string) => songs.reduce((n, s) => n + ((memberships[s.id] ?? []).includes(playlistId) ? 1 : 0), 0),
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

  const q = normalize(query.trim());
  const filtering = q.length > 0;

  const matchesQuery = useCallback(
    (song: Song) => !q || normalize(song.title).includes(q) || normalize(song.artist ?? "").includes(q),
    [q]
  );

  // Aramada her listenin kaç eşleşmesi olduğunu yan rayda göstermek için
  const matchCountFor = useCallback(
    (playlistId: string) =>
      songs.reduce((n, s) => n + ((memberships[s.id] ?? []).includes(playlistId) && matchesQuery(s) ? 1 : 0), 0),
    [songs, memberships, matchesQuery]
  );

  // Raydaki sıralama: önce çalma kuyruğu (çalacakları sırayla), sonra sırada
  // olmayan listeler. Böylece "ne zaman çalacak" sorusunun cevabı yukarıdan
  // aşağı okunur.
  const railLists = useMemo(() => {
    const idle = playlists
      .filter((p) => p.queue_position === null)
      .sort((a, b) => a.sort_order - b.sort_order);
    return [...queueLists, ...idle];
  }, [playlists, queueLists]);

  // Raydaki listeler: ad araması süzer, seçili liste her zaman görünür kalır
  const listQ = normalize(listQuery.trim());
  const visiblePlaylists = useMemo(() => {
    if (!listQ) return railLists;
    return railLists.filter((p) => normalize(p.name).includes(listQ) || p.id === viewId);
  }, [railLists, listQ, viewId]);

  const visibleSongs = useMemo(() => {
    if (viewId === ALL) return q ? songs.filter(matchesQuery) : songs;
    // Liste görünümü: katalog sırası değil, listenin kendi çalma sırası
    const order = positions[viewId] ?? {};
    const inView = songs
      .filter((s) => (memberships[s.id] ?? []).includes(viewId))
      .sort((a, b) => (order[a.id] ?? 0) - (order[b.id] ?? 0));
    return q ? inView.filter(matchesQuery) : inView;
  }, [songs, memberships, positions, viewId, q, matchesQuery]);

  // Sıra değiştirme yalnızca tek listenin tamamı ekrandayken açık: "Tüm Şarkılar"
  // görünümünde ortak bir sıra yok, aramada ise ekrandaki satırlar listenin
  // tamamı değil.
  const orderable = viewId !== ALL && !filtering;

  // Modal açılırken hedef liste: seçili liste, yoksa kuyruktaki ilki, o da yoksa
  // mekanın ilk listesi
  const defaultTarget = useCallback(() => {
    if (viewId !== ALL) return viewId;
    return queueLists[0]?.id ?? playlists[0]?.id ?? "";
  }, [viewId, queueLists, playlists]);

  const toggleInList = async (venueSongId: string, current: boolean) => {
    const res = await fetch("/api/admin/playlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue_song_id: venueSongId, in_venue_list: !current }),
    });
    if (res.ok) {
      setSongs((prev) => prev.map((s) => (s.venueSongId === venueSongId ? { ...s, in_venue_list: !current } : s)));
    }
  };

  // playlistId verilirse yalnızca o listeden, null verilirse mekandan tamamen çıkarır.
  // Son üyelik gidince katalog satırı da düştüğü için o durumda da onay sorulur.
  const removeSongFrom = async (song: Song, playlistId: string | null) => {
    const lastOne = (memberships[song.id] ?? []).length <= 1;

    if (!playlistId || lastOne) {
      const message = playlistId
        ? `"${song.title}" başka listede değil — mekandan tamamen kaldırılacak. Devam edilsin mi?`
        : `"${song.title}" tüm listelerden ve mekan katalogundan kaldırılacak. Devam edilsin mi?`;
      if (!confirm(message)) return { ok: false as const, error: "" };
    }

    const res = await fetch("/api/admin/playlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venue_song_id: song.venueSongId,
        ...(playlistId ? { playlist_id: playlistId } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false as const, error: (data.error as string) ?? "Kaldırılamadı" };
    }
    await refresh();
    return { ok: true as const };
  };

  // Liste görünümünde yalnızca o listeden, "Tümü" görünümünde mekandan tamamen çıkarır
  const removeSong = (song: Song) => removeSongFrom(song, viewId === ALL ? null : viewId);

  // Katalogdaki bir şarkıyı başka bir listeye de ekler (kopyalamaz — aynı şarkı
  // birden çok listenin üyesi olabilir).
  const addSongToPlaylist = async (song: Song, playlistId: string) => {
    const res = await fetch("/api/admin/playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtube_video_id: song.youtube_video_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url,
        duration_ms: song.duration_ms,
        playlist_id: playlistId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: (data.error as string) ?? "Eklenemedi" };
    await refresh();
    return { ok: true as const };
  };

  // Listeyi çalma kuyruğuna alır ya da kuyruktan çıkarır. Kuyruğa eklemek çalanı
  // değiştirmez — liste sıranın sonuna girer, sırası gelince çalar.
  const setQueued = async (playlist: Playlist, next: boolean) => {
    if ((playlist.queue_position !== null) === next) return;
    const optimistic = next ? (queueLists.at(-1)?.queue_position ?? 0) + 1 : null;
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, queue_position: optimistic } : p)));

    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, queued: next }),
    });
    if (!res.ok) {
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlist.id ? { ...p, queue_position: playlist.queue_position } : p))
      );
      return;
    }
    await refresh();
  };

  // Play: imleç bu listeye atlar, liste baştan başlar. O ana kadar çalan liste
  // kuyruktan düşer — yani bu liste bitince sıradaki liste gelir, çalması kesilen
  // liste başa dönmez. Sahnedeki şarkı kesilmez, müşteri istekleri etkilenmez.
  const playNow = async (playlist: Playlist) => {
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, play: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: (data.error as string) ?? "Çalınamadı" };
    await refresh();
    return { ok: true as const };
  };

  // Tek seferlik çalma: liste bir turunu bitirince kuyruktan düşer.
  const setPlayOnce = async (playlist: Playlist, next: boolean) => {
    if (playlist.play_once === next) return;
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, play_once: next } : p)));
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, play_once: next }),
    });
    if (!res.ok) {
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, play_once: !next } : p)));
    }
  };

  // Müşteriye aktiflik (0040): pasif listedeki şarkılar müşteri panelinde hiç
  // görünmez ve jetonla sıraya eklenemez. Otomatik çalmaya dokunmaz — liste
  // kuyruktaysa sırası gelince yine çalar, o yüzden kuyruk tazelenmez.
  const setCustomerVisible = async (playlist: Playlist, next: boolean) => {
    if (playlist.customer_visible === next) return;
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, customer_visible: next } : p)));
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, customer_visible: next }),
    });
    if (!res.ok) {
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, customer_visible: !next } : p)));
    }
  };

  // Listeyi raydaki grubu içinde taşır: kuyruktakiler kuyruk sırasını (yani çalma
  // sırasını), sıradışılar yalnızca görünüm sırasını değiştirir. Sıra sunucuda
  // dizinin kendisi olarak yazılır; rotasyon imleci korunur, yani sıra değiştirmek
  // çalan listeyi başa sarmaz. Komşu takası değil çıkar-yerleştir.
  const moveListTo = async (playlist: Playlist, to: number) => {
    if (reordering) return;
    const queued = playlist.queue_position !== null;
    const group = railLists.filter((p) => (p.queue_position !== null) === queued);
    const from = group.findIndex((p) => p.id === playlist.id);
    if (from < 0) return;
    const target = Math.min(group.length - 1, Math.max(0, to));
    if (target === from) return;

    const next = [...group];
    next.splice(from, 1);
    next.splice(target, 0, group[from]);

    const previous = playlists;
    const moved = new Map(
      next.map((p, i) => [p.id, queued ? { queue_position: i + 1 } : { sort_order: i }])
    );
    setPlaylists((prev) => prev.map((p) => ({ ...p, ...(moved.get(p.id) ?? {}) })));
    setReordering(true);

    try {
      const res = await fetch("/api/admin/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          queued ? { queue_order: next.map((p) => p.id) } : { order: next.map((p) => p.id) }
        ),
      });
      if (!res.ok) setPlaylists(previous);
    } catch {
      setPlaylists(previous);
    } finally {
      setReordering(false);
    }
  };

  const moveList = (playlist: Playlist, delta: -1 | 1) => {
    const queued = playlist.queue_position !== null;
    const group = railLists.filter((p) => (p.queue_position !== null) === queued);
    const from = group.findIndex((p) => p.id === playlist.id);
    if (from < 0) return Promise.resolve();
    return moveListTo(playlist, from + delta);
  };

  // Bekleyen sıra yazımı: art arda taşımalar tek isteğe toplanır. Sunucu diziyi
  // olduğu gibi yazdığı için son gönderim yeterli — aradaki adımlar atlanabilir.
  const flushOrder = useCallback(async () => {
    const pending = pendingOrderRef.current;
    if (!pending) return;
    pendingOrderRef.current = null;
    savingOrderRef.current = true;
    setSavingOrder(true);

    try {
      const res = await fetch("/api/admin/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: pending.listId, song_order: pending.ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Sunucu yazmadı: ekrandaki sıra da son bilinen doğru haline dönmeli
        setPositions((prev) => ({ ...prev, [pending.listId]: pending.previous }));
        setOrderError(data.error ?? "Sıra kaydedilemedi");
      }
    } catch {
      setPositions((prev) => ({ ...prev, [pending.listId]: pending.previous }));
      setOrderError("Bağlantı hatası, tekrar deneyin");
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
    }
  }, []);

  // Şarkıyı liste içinde taşır. Ekranda anında uygulanır, yazma yarım saniye
  // beklemeden gitmez — üst üste taşımalarda arayüz kilitlenmez.
  const moveSong = (from: number, to: number) => {
    if (viewId === ALL || filtering) return;
    if (from === to || from < 0 || to < 0 || to >= visibleSongs.length) return;

    const next = [...visibleSongs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    // Geri dönüş noktası ilk taşımadaki sıradır; aradaki adımlar zaten kaydedilmedi
    const previous = pendingOrderRef.current?.previous ?? positions[viewId] ?? {};
    setPositions((prev) => ({
      ...prev,
      [viewId]: Object.fromEntries(next.map((s, i) => [s.id, i + 1])),
    }));
    setOrderError("");

    pendingOrderRef.current = { listId: viewId, ids: next.map((s) => s.id), previous };
    if (orderTimerRef.current) clearTimeout(orderTimerRef.current);
    orderTimerRef.current = setTimeout(flushOrder, 500);
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
    await refresh();
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
      await refresh();
    } catch {
      setSyncNote("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSyncingId(null);
    }
  };

  const createList = async (name: string) => {
    const res = await fetch("/api/admin/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: (data.error as string) ?? "Oluşturulamadı" };
    setPlaylists((prev) => [...prev, data.playlist as Playlist]);
    setSelectedId(data.playlist.id);
    return { ok: true as const };
  };

  const renameList = async (playlist: Playlist, name: string) => {
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: (data.error as string) ?? "Kaydedilemedi" };
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, name } : p)));
    return { ok: true as const };
  };

  const deleteList = async (playlist: Playlist) => {
    const count = countFor(playlist.id);
    if (
      !confirm(
        `"${playlist.name}" listesi silinecek.` +
          (count ? ` Yalnızca bu listede olan şarkılar mekan katalogundan da düşer.` : "")
      )
    )
      return;

    const res = await fetch("/api/admin/playlists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id }),
    });
    if (res.ok) {
      setSelectedId(ALL);
      await refresh();
    }
  };

  return {
    // veri
    songs,
    playlists,
    memberships,
    visiblePlaylists,
    visibleSongs,
    railLists,
    queueLists,
    currentList,
    selectedList,
    selectedSource,
    sourceByList,
    coversByList,
    catalogCovers,
    consumed,
    loading,
    viewId,
    // arama
    query,
    setQuery,
    listQuery,
    setListQuery,
    filtering,
    matchesQuery,
    matchCountFor,
    countFor,
    // sıra
    orderable,
    orderError,
    savingOrder,
    reordering,
    moveSong,
    moveList,
    moveListTo,
    // eylemler
    setSelectedId,
    defaultTarget,
    toggleInList,
    removeSong,
    removeSongFrom,
    addSongToPlaylist,
    setQueued,
    playNow,
    setPlayOnce,
    setShuffle,
    setCustomerVisible,
    syncNow,
    syncingId,
    syncNote,
    setSyncNote,
    createList,
    renameList,
    deleteList,
    refresh,
  };
}

export type Library = ReturnType<typeof useLibrary>;
