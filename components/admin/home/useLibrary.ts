"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

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
 *
 * playback: alt bar/kuyruk hook'u. İki şey için lazım — "hangi liste çalıyor"
 * kuyruktan okunur (bkz. currentList) ve play tuşu sahneyi devraldığında
 * player'a gecikmesiz "bu videoyu yükle" denir.
 */
export function useLibrary(
  venueDbId: string,
  initialListId: string = ALL,
  playback?: {
    playingListId: string | null;
    pendingByList: Record<string, number>;
    manualByList: Record<string, number>;
    stageTakeover: (videoId: string, options?: { refreshQueue?: boolean }) => void;
    // Play tuşunun sahneyi devralıp almayacağını sunucudan ÖNCE kestirmek için
    // (bkz. playNow): müşteri şarkısı sahnedeyse ya da sırada bekliyorsa liste
    // sahneyi alamaz.
    currentIsCustomer: boolean;
    queue: { user_id: string | null }[];
    nowPlaying: { video_id?: string | null } | null;
  }
) {
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
  // playlist_id -> bu turda TÜKETİLMİŞ (kuyruğa yazılmış) şarkı sayısı. Ekranda
  // gösterilen "çalındı" sayısı bu değil, bunun kuyrukta bekleyenler düşülmüş
  // hali — bkz. aşağıdaki playedByList.
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

  // Aynı anda birden fazla tam yükleme başlamasın: biri uçarken gelen istek ona
  // bağlanır, uçuş sırasında yeni olay geldiyse bitiminde bir kez daha koşar.
  // Öncesinde tek yazma iki tam yükleme doğuruyordu (kendi tazelememiz + aynı
  // yazmanın Realtime yankısı).
  const inFlightRef = useRef<Promise<void> | null>(null);
  const staleRef = useRef(false);

  // Yalnızca "hangi liste çalıyor + bu turda kaç şarkı çalındı". İki hafif sorgu:
  // imleci değiştiren düğmeler (play, sıraya al, karıştır) tüm katalogu yeniden
  // çekmek yerine bunu çağırır.
  const fetchRotation = useCallback(
    async (venueDbIdArg: string) => {
      const { data: rotationRow } = await supabase
        .from("playlist_rotation")
        .select("playlist_id, cycle")
        .eq("venue_id", venueDbIdArg)
        .maybeSingle();

      const rot = (rotationRow as Rotation | null) ?? null;
      setRotation(rot);

      const { data: consumedRows } = await fetchAllRows<{ playlist_id: string }>((from, to) =>
        supabase
          .from("playlist_rotation_consumed")
          .select("playlist_id, song_id")
          .eq("venue_id", venueDbIdArg)
          .eq("cycle", rot?.cycle ?? 1)
          .order("song_id", { ascending: true })
          .range(from, to)
      );

      const counts: Record<string, number> = {};
      for (const row of consumedRows) {
        counts[row.playlist_id] = (counts[row.playlist_id] ?? 0) + 1;
      }
      setConsumed(counts);
    },
    [supabase]
  );

  // Katalog: sayfalı çekilir çünkü PostgREST tek yanıtta 1000 satırda kesiyor.
  // En pahalı yükleme bu — 1200 şarkılık mekanda iki sayfa + büyük JSON.
  const fetchCatalog = useCallback(
    async (venueDbIdArg: string) => {
      type VenueSongRow = {
        id: string;
        play_count: number;
        in_venue_list: boolean;
        songs: Omit<Song, "venueSongId" | "play_count" | "in_venue_list"> | null;
      };

      const { data } = await fetchAllRows<VenueSongRow>((from, to) =>
        supabase
          .from("venue_songs")
          .select("id, play_count, in_venue_list, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
          .eq("venue_id", venueDbIdArg)
          .order("added_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
      );

      setSongs(
        data
          .filter((vs) => vs.songs)
          .map((vs) => ({ ...vs.songs!, venueSongId: vs.id, play_count: vs.play_count, in_venue_list: vs.in_venue_list }))
      );
    },
    [supabase]
  );

  // Listeler: tek sorgu, birkaç düzine satır. Play/sıraya al/ad değişikliği
  // yalnızca bunu tazeler — katalogu değil.
  const fetchPlaylists = useCallback(
    async (venueDbIdArg: string) => {
      const { data } = await supabase
        .from("playlists")
        .select("id, name, queue_position, sort_order, shuffle, customer_visible")
        .eq("venue_id", venueDbIdArg)
        .order("sort_order", { ascending: true });
      if (data) setPlaylists(data as Playlist[]);
    },
    [supabase]
  );

  const fetchMembers = useCallback(
    async (venueDbIdArg: string) => {
      const { data } = await fetchAllRows<{ playlist_id: string; song_id: string; position: number }>(
        (from, to) =>
          supabase
            .from("playlist_songs")
            .select("playlist_id, song_id, position")
            .eq("venue_id", venueDbIdArg)
            .order("position", { ascending: true })
            .order("song_id", { ascending: true })
            .range(from, to)
      );

      const map: Record<string, string[]> = {};
      const order: Record<string, Record<string, number>> = {};
      for (const m of data) {
        (map[m.song_id] ??= []).push(m.playlist_id);
        (order[m.playlist_id] ??= {})[m.song_id] = m.position;
      }
      setMemberships(map);
      setPositions(order);
    },
    [supabase]
  );

  const fetchSources = useCallback(
    async (venueDbIdArg: string) => {
      const { data } = await supabase
        .from("playlist_sources")
        .select("playlist_id, youtube_playlist_id, auto_sync, last_synced_at, last_added, last_error")
        .eq("venue_id", venueDbIdArg);
      if (data) {
        setSourceByList(Object.fromEntries((data as PlaylistSource[]).map((s) => [s.playlist_id, s])));
      }
    },
    [supabase]
  );

  const fetchAll = useCallback(
    async (venueDbIdArg: string) => {
      await Promise.all([
        fetchCatalog(venueDbIdArg),
        fetchPlaylists(venueDbIdArg),
        fetchMembers(venueDbIdArg),
        fetchSources(venueDbIdArg),
        fetchRotation(venueDbIdArg),
      ]);
      setLoading(false);
    },
    [fetchCatalog, fetchPlaylists, fetchMembers, fetchSources, fetchRotation]
  );

  const refresh = useCallback(async () => {
    if (!venueDbId) return;
    // Uçuşta bir yükleme varsa yenisini başlatma — onu bekle, sonucu zaten aynı.
    if (inFlightRef.current) {
      staleRef.current = true;
      return inFlightRef.current;
    }
    const run = (async () => {
      try {
        await fetchAll(venueDbId);
        // Yükleme sürerken yeni değişiklik geldiyse bir tur daha
        while (staleRef.current) {
          staleRef.current = false;
          await fetchAll(venueDbId);
        }
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = run;
    return run;
  }, [venueDbId, fetchAll]);

  // İmleç/ilerleme tazelemesi: katalogu değil yalnızca rotasyonu okur
  const refreshRotation = useCallback(() => {
    if (venueDbId) void fetchRotation(venueDbId);
  }, [venueDbId, fetchRotation]);

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    // Hangi tabloların tazelenmesi gerektiği biriktirilir: bir liste değişikliği
    // (play, sıraya al, ad) yalnızca playlists sorgusunu yeniler — 1200 şarkılık
    // katalogu yeniden çekmez. Eskiden HER olay tam yükleme tetikliyordu, tıklama
    // sonrası saniyelerce süren donmanın asıl sebebi buydu.
    const dirty = new Set<"catalog" | "playlists" | "members" | "sources" | "rotation">();

    // Tek işlem çok satır değiştirebiliyor (içe aktarma, liste içi sıralama) —
    // her olayda değil, olay yağmuru dindikten sonra bir kez tazelenir.
    const scheduleRefresh = (part: "catalog" | "playlists" | "members" | "sources" | "rotation") => () => {
      dirty.add(part);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (cancelled) return;
        // Kaydedilmemiş ya da yolda olan sıra varsa tazeleme beklesin: sunucudan
        // gelen eski sıra kullanıcının ekranındaki taşımaları geri alırdı.
        if (pendingOrderRef.current || savingOrderRef.current) {
          scheduleRefresh(part)();
          return;
        }
        const parts = [...dirty];
        dirty.clear();
        void Promise.all(
          parts.map((p) => {
            if (p === "catalog") return fetchCatalog(venueDbId);
            if (p === "playlists") return fetchPlaylists(venueDbId);
            if (p === "members") return fetchMembers(venueDbId);
            if (p === "sources") return fetchSources(venueDbId);
            return fetchRotation(venueDbId);
          })
        ).catch(() => {});
      }, 300);
    };

    void refresh();

    channel = supabase
      .channel(`venue_playlists:${venueDbId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_songs", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh("catalog"))
      .on("postgres_changes", { event: "*", schema: "public", table: "playlists", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh("playlists"))
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_songs", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh("members"))
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_sources", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh("sources"))
      // Sıralı moddaki "şu an çalan liste — 12/40" göstergesi her dolumda tazelensin
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_rotation", filter: `venue_id=eq.${venueDbId}` }, scheduleRefresh("rotation"))
      .subscribe();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueDbId, supabase, refresh, fetchCatalog, fetchPlaylists, fetchMembers, fetchSources, fetchRotation]);

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

  // Şu an hangi listeden çalınıyor. Ölçüt kuyruğun kendisidir: sahnedeki şarkı
  // (o olmazsa sırada bekleyen ilk playlist şarkısı) hangi listeden geldiyse
  // çalan liste odur.
  //
  // Rotasyon imleci bunu söyleyemez, yalnızca yedektir: imleç "bir sonraki dolum
  // nereden yapılacak"tır ve kuyruk listenin sonuna kadar dolu olduğu için
  // listenin son şarkıları hâlâ sırada beklerken imleç sıradaki listeye kaymış
  // olur. Listenin
  // ortasından bir şarkı çalındığında ("17. şarkıdan devam") bu fark hemen
  // görünüyordu: sıra hâlâ o listeden çalarken rozet sıradaki listeye geçiyordu.
  //
  // İmleçteki liste kuyruktan çıkarılmış ya da silinmişse sunucu da kuyruğun
  // başına döner, burada da öyle. Kuyruk boşsa null — tüm katalogdan karışık çalınır.
  const currentList = useMemo(() => {
    const playing = queueLists.find((p) => p.id === playback?.playingListId);
    const pointed = queueLists.find((p) => p.id === rotation?.playlist_id);
    return playing ?? pointed ?? queueLists[0] ?? null;
  }, [queueLists, rotation, playback?.playingListId]);

  // Ekrandaki "çalındı" sayısı: kuyruğa yazılmış (consumed) eksi hâlâ kuyrukta
  // bekleyen. Kuyruk listenin sonuna kadar dolduğu için çıplak consumed listeyi
  // daha ilk anda "40/40" gösterirdi.
  const playedByList = useMemo(() => {
    const pending = playback?.pendingByList ?? {};
    const map: Record<string, number> = {};
    for (const [id, n] of Object.entries(consumed)) {
      map[id] = Math.max(0, n - (pending[id] ?? 0));
    }
    return map;
  }, [consumed, playback?.pendingByList]);

  const selectedList = useMemo(
    () => playlists.find((p) => p.id === selectedId) ?? null,
    [playlists, selectedId]
  );

  // Seçilen liste silinirse (ya da veri henüz gelmediyse) görünüm "Tümü"ne düşer
  const viewId = selectedList ? selectedId : ALL;
  const selectedSource = selectedList ? sourceByList[selectedList.id] : undefined;

  // Liste başına şarkı sayısı tek geçişte çıkarılır. Eskiden her liste satırı
  // için tüm katalog taranıyordu: 40 liste × 3000 şarkı = her render'da 120 bin
  // karşılaştırma, üstelik memoize edilmeden.
  const countsByList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const song of songs) {
      for (const pid of memberships[song.id] ?? []) counts[pid] = (counts[pid] ?? 0) + 1;
    }
    return counts;
  }, [songs, memberships]);

  const countFor = useCallback((playlistId: string) => countsByList[playlistId] ?? 0, [countsByList]);

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

  // Aramada her listenin kaç eşleşmesi olduğunu yan rayda göstermek için —
  // arama yokken zaten toplam sayı, ikinci bir tarama yapılmaz
  const matchCountsByList = useMemo(() => {
    if (!q) return countsByList;
    const counts: Record<string, number> = {};
    for (const song of songs) {
      if (!matchesQuery(song)) continue;
      for (const pid of memberships[song.id] ?? []) counts[pid] = (counts[pid] ?? 0) + 1;
    }
    return counts;
  }, [q, songs, memberships, matchesQuery, countsByList]);

  const matchCountFor = useCallback(
    (playlistId: string) => matchCountsByList[playlistId] ?? 0,
    [matchCountsByList]
  );

  // Raydaki sıralama: en üstte ÇALAN liste, altında ötekiler. Listelerin
  // birbiri ardına dizildiği eski "playlist kuyruğu" kalktı — sıraya eklenen
  // liste artık kuyruğa şarkı yazar (bkz. queuedByList), rayda sıra tutmaz.
  const queueRail = useMemo(() => {
    const at = currentList ? queueLists.findIndex((p) => p.id === currentList.id) : -1;
    return at > 0 ? [...queueLists.slice(at), ...queueLists.slice(0, at)] : queueLists;
  }, [queueLists, currentList]);

  const railLists = useMemo(() => {
    const idle = playlists
      .filter((p) => p.queue_position === null)
      .sort((a, b) => a.sort_order - b.sort_order);
    return [...queueRail, ...idle];
  }, [playlists, queueRail]);

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

    // Ekran sunucu turunu beklemeden düzelir: tüm katalogu yeniden çekmek yerine
    // yalnızca bu şarkının üyelikleri düşülür. Gerçek satırlar Realtime ile
    // birazdan zaten gelecek.
    const remaining = playlistId ? (memberships[song.id] ?? []).filter((id) => id !== playlistId) : [];
    setMemberships((prev) => {
      const next = { ...prev };
      if (remaining.length > 0) next[song.id] = remaining;
      else delete next[song.id];
      return next;
    });
    setPositions((prev) => {
      const next = { ...prev };
      for (const pid of playlistId ? [playlistId] : memberships[song.id] ?? []) {
        if (!next[pid]) continue;
        const rest = { ...next[pid] };
        delete rest[song.id];
        next[pid] = rest;
      }
      return next;
    });
    // Hiçbir listede kalmadıysa katalogdan da düşer (0026 trigger'ı)
    if (remaining.length === 0) {
      setSongs((prev) => prev.filter((s) => s.venueSongId !== song.venueSongId));
    }
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

    // Şarkı zaten katalogda; değişen tek şey yeni üyelik. Listenin sonuna girer
    // (sunucu da öyle yazıyor), tam yükleme gerekmez.
    setMemberships((prev) => ({ ...prev, [song.id]: [...(prev[song.id] ?? []), playlistId] }));
    setPositions((prev) => {
      const list = prev[playlistId] ?? {};
      const last = Object.values(list).reduce((max, pos) => Math.max(max, pos), 0);
      return { ...prev, [playlistId]: { ...list, [song.id]: last + 1 } };
    });
    return { ok: true as const };
  };

  // Listeyi çalma kuyruğuna alır ya da kuyruktan çıkarır. Kuyruğa eklemek çalanı
  // değiştirmez — liste sıranın sonuna girer, sırası gelince çalar.
  // "Sıraya ekle" / "Sıradan çıkar" (Spotify mantığı): liste tek blok halinde
  // ÇALAN ŞARKIDAN HEMEN SONRAYA girer, çalan liste kesilmez ve blok bitince
  // kaldığı yerden devam eder. Ekranda gösterilen "sırada" durumu artık
  // playlist satırından değil KUYRUKTAN okunur (bkz. playback.manualByList), o
  // yüzden burada iyimser güncelleme yok — kuyruk Realtime ile hemen tazelenir.
  const setQueued = async (playlist: Playlist, next: boolean) => {
    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlist.id, queued: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false as const, error: (data.error as string) ?? "Sıraya eklenemedi" };
    }
    // Sıradan çıkarma çalan listeyi de durdurabilir — rotasyon tazelenir
    if (!next) refreshRotation();
    return { ok: true as const };
  };

  // Play: liste baştan ve HEMEN çalar — ilk şarkısı sahneye çıkar, kuyruk
  // devamıyla dolar. O ana kadar çalan liste kuyruktan düşer: bu liste bitince
  // sıradaki gelir, kesilen liste başa dönmez.
  //
  // Sahnedeki şarkı müşterinin ise kesilmez (sunucudaki kilit): liste sahneyi
  // devralmaz, müşteri istekleri bitince baştan çalmaya başlar.
  // Listenin açılış şarkısı, PANELDEKİ veriden: sıralı listede ilk sıradaki,
  // karıştırmalı listede rastgele biri. Sunucudaki pickPlaylistOpener ile aynı
  // kural — bu yüzden panel şarkıyı sunucuya danışmadan başlatabiliyor ve
  // seçimini ipucu olarak yollayıp ikisinin ayrışmasını önlüyor.
  const localOpener = useCallback(
    (playlistId: string, shuffle: boolean): Song | null => {
      const order = positions[playlistId] ?? {};
      const members = songs.filter(
        (s) => (memberships[s.id] ?? []).includes(playlistId) && s.youtube_video_id
      );
      if (members.length === 0) return null;
      if (shuffle) return members[Math.floor(Math.random() * members.length)];
      return members.reduce((first, s) =>
        (order[s.id] ?? Infinity) < (order[first.id] ?? Infinity) ? s : first
      );
    },
    [songs, memberships, positions]
  );

  const playNow = async (playlist: Playlist) => {
    // Ekran sunucuyu beklemeden değişir: "Çalıyor" rozeti bu listeye geçer,
    // ilerleme sıfırlanır, o ana kadar çalan liste kuyruktan düşer. Sunucudaki
    // playPlaylistNow ile birebir aynı kural — yanıt gelince gerçek satırlar
    // üzerine yazar, hata gelirse hepsi geri alınır.
    const previousPlaylists = playlists;
    const previousRotation = rotation;
    const previousConsumed = consumed;

    // Çalan liste TEKTİR: bu liste devralır, o ana kadar çalan(lar) rotasyondan
    // çıkar. Sunucudaki makeSolePlayingPlaylist ile birebir aynı kural.
    const dropped = queueLists.filter((p) => p.id !== playlist.id).map((p) => p.id);

    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlist.id
          ? { ...p, queue_position: 1 }
          : p.queue_position !== null
            ? { ...p, queue_position: null }
            : p
      )
    );
    setRotation({ playlist_id: playlist.id, cycle: rotation?.cycle ?? 1 });
    setConsumed((prev) => {
      const next = { ...prev, [playlist.id]: 0 };
      for (const id of dropped) delete next[id];
      return next;
    });

    // Açılış şarkısını panel de biliyor: sunucu turunu beklemeden player'a
    // "bu videoyu yükle" denir ve aynı şarkı ipucu olarak yollanır. Sahneyi
    // devralmayacağımız üç hal sunucudakiyle birebir aynı kuralla elenir —
    // müşteri şarkısı sahnedeyse ya da sırada bekliyorsa liste sahneyi almaz,
    // açılış şarkısı zaten çalıyorsa da baştan başlatılmaz.
    const opener = localOpener(playlist.id, playlist.shuffle);
    const customerWaiting = (playback?.queue ?? []).some((q) => q.user_id !== null);
    const takeover =
      !!opener &&
      !playback?.currentIsCustomer &&
      !customerWaiting &&
      playback?.nowPlaying?.video_id !== opener.youtube_video_id;

    if (takeover && opener) playback?.stageTakeover(opener.youtube_video_id, { refreshQueue: false });

    const res = await fetch("/api/admin/playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playlist_id: playlist.id,
        play: true,
        ...(opener ? { opener_song_id: opener.id } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPlaylists(previousPlaylists);
      setRotation(previousRotation);
      setConsumed(previousConsumed);
      // İyimser başlattığımız şarkıyı geri al
      if (takeover && playback?.nowPlaying?.video_id) {
        playback.stageTakeover(playback.nowPlaying.video_id, { refreshQueue: false });
      }
      return { ok: false as const, error: (data.error as string) ?? "Çalınamadı" };
    }
    // Sahne değiştiyse video kimliği döner. Bizim başlattığımızla aynıysa komut
    // tekrarlanmaz; farklıysa (sırada müşteri şarkısı varmış, liste onun altından
    // başlar) sunucunun dediği çalar.
    if (typeof data.video_id === "string") {
      if (data.video_id !== opener?.youtube_video_id) playback?.stageTakeover(data.video_id);
    } else if (takeover && playback?.nowPlaying?.video_id) {
      // Sunucu sahneye HİÇ dokunmadı (araya bir müşteri isteği girmiş olabilir):
      // iyimser başlattığımız şarkı geri alınır, sahnedeki şarkı devam eder.
      playback.stageTakeover(playback.nowPlaying.video_id);
    }
    return { ok: true as const };
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
    // Çalan liste rayın tepesinde sabit: ne kendisi taşınır ne de üstüne geçilir.
    // (Kuyruk döngüsel olduğu için "çalanın üstü" diye bir yer zaten yok — oraya
    // taşımak hiçbir şeyi değiştirmezdi.)
    const pinned = queued && group.length > 0;
    if (pinned && from === 0) return;
    const target = Math.min(group.length - 1, Math.max(pinned ? 1 : 0, to));
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
    // Yalnızca bekleyen otomatik şarkılar yeniden seçildi (sunucuda, yanıttan
    // sonra) — katalog aynı. İlerleme göstergesi için rotasyon yeter.
    refreshRotation();
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
      // Elle senkron iki yönlü: YouTube'dan çıkarılan şarkı buradan da düşer
      const parts: string[] = [];
      if (data.added > 0) parts.push(`${data.added} yeni şarkı eklendi`);
      if (data.removed > 0) parts.push(`${data.removed} şarkı kaldırıldı`);
      setSyncNote(
        parts.length > 0
          ? `"${playlist.name}": ${parts.join(", ")}`
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
    if (!res.ok) return;

    // Ekran anında düzelir: liste, üyelikleri ve yalnızca bu listede olan
    // şarkılar (0026 trigger'ı katalogdan da düşürür) yerel olarak temizlenir.
    setSelectedId(ALL);
    setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
    setPositions((prev) => {
      const next = { ...prev };
      delete next[playlist.id];
      return next;
    });
    setSourceByList((prev) => {
      const next = { ...prev };
      delete next[playlist.id];
      return next;
    });
    const nextMemberships: Record<string, string[]> = {};
    const orphaned = new Set<string>();
    for (const [songId, lists] of Object.entries(memberships)) {
      const remaining = lists.filter((id) => id !== playlist.id);
      if (remaining.length > 0) nextMemberships[songId] = remaining;
      else orphaned.add(songId);
    }
    setMemberships(nextMemberships);
    setSongs((prev) => prev.filter((s) => !orphaned.has(s.id)));
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
    consumed: playedByList,
    // Liste başına ELLE sıraya eklenmiş, hâlâ bekleyen şarkı sayısı. Raydaki
    // "sırada" durumu artık playlist satırından değil kuyruktan okunur.
    queuedByList: playback?.manualByList ?? {},
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
    refreshRotation,
  };
}

export type Library = ReturnType<typeof useLibrary>;
