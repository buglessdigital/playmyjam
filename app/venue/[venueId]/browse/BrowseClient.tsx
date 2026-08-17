"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { useVenueGate, venueLoginPath } from "@/lib/venue-gate";
import { useNowPlayingClock, waitMs } from "@/lib/wait-time";
import { normalQueuedCount, priorityCostFor } from "@/lib/pricing";
import LangToggle from "@/components/ui/LangToggle";
import { publishTokenBalance } from "@/lib/token-balance-store";
import ProfileChip from "@/components/ui/ProfileChip";
import PlayerOfflineNotice from "@/components/ui/PlayerOfflineNotice";
import { usePlayerOnline } from "@/lib/use-player-online";
import { fmt, useT } from "@/lib/i18n";
import AddSongSheet from "@/components/browse/AddSongSheet";
import NowPlayingBanner from "@/components/browse/NowPlayingBanner";
import SearchView, { type SuggestResult } from "@/components/browse/SearchView";
import SongCard from "@/components/browse/SongCard";
import SongRow from "@/components/browse/SongRow";
import NotifyOptIn from "@/components/browse/NotifyOptIn";
import { savePendingSuggestion, takePendingSuggestion } from "@/lib/pending-suggestion";
import { clearPendingAdd, peekPendingAdd, savePendingAdd, takePendingAdd } from "@/lib/pending-add";
import { takeFirstVisit } from "@/lib/first-visit";
import { refreshPushSubscription } from "@/lib/notifications";
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

// Gözat sayfasındaki ana listenin en az bu kadar şarkı göstermesi hedeflenir —
// mekanın müşteriye açık şarkısı yetmiyorsa doğal olarak daha az olur.
const MIN_LIST_SONGS = 20;

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
  requestCost: number;
  priorityCost: number;
  /** Jeton başına TL — sheet'te jeton tutarlarının altında para karşılığı gösterilir */
  tokenUnitPrice: number;
}

export default function BrowseClient({ venueId, venueDbId, initialVenueSongs, requestCost, priorityCost, tokenUnitPrice }: Props) {
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
  // Mekanın onayladığı tek seferlik şarkılar (0045) — katalogda değiller,
  // süreleri dolunca ya da biri çaldırınca kendiliğinden düşerler
  const [oneTimeSongs, setOneTimeSongs] = useState<VenueSong[]>([]);
  const [oneTimeTick, setOneTimeTick] = useState(() => Date.now());
  // Girişten sonra kendiliğinden gönderilen talebin sonucu
  const [suggestFlash, setSuggestFlash] = useState<
    { state: "sent" | "error"; title: string; artist: string } | null
  >(null);
  const isAddingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { isMember, requireAccount } = useVenueGate(venueId);
  const t = useT();
  // Oynatıcı kapalıyken ekleme kapalı ve süreler gizli — ilk okuma gelene kadar
  // (null) açık varsayılır ki yanlış uyarı çakmasın
  const playerOffline = usePlayerOnline(venueDbId) === false;

  useEffect(() => {
    // getSession reads from local cache — no network round-trip
    supabase.auth.getSession().then(({ data }: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
      userIdRef.current = data.session?.user?.id ?? null;
    });
  }, [supabase]);

  // Müşteri katalogu = YALNIZCA çaldırılabilir şarkılar. Müşteriye kapalı olanlar
  // (admin tek tek gizlemiş ya da bulunduğu listelerin hepsi pasif — bkz. 0040)
  // gözat sayfasında hiç görünmez; "İstek" rozetiyle bile listelenmez. Listede
  // olmayan bir şarkı için müşteri aramadan serbest metin öneri gönderir.
  //
  // Tek seferlik haklar katalogun ÜSTÜNE biner: arama, sanatçı listesi ve
  // "şansına bırak" hepsi tek liste üzerinden çalıştığı için tek yerde birleşir.
  const catalogSongs = useMemo(() => {
    const playable = venueSongs.filter((s) => s.in_venue_list);
    if (oneTimeSongs.length === 0) return playable;
    const oneTimeIds = new Set(oneTimeSongs.map((s) => s.id));
    return [...oneTimeSongs, ...playable.filter((s) => !oneTimeIds.has(s.id))];
  }, [venueSongs, oneTimeSongs]);

  const venueSongMap = useMemo(() => {
    const map = new Map<string, VenueSong>();
    catalogSongs.forEach((s) => map.set(s.youtube_video_id, s));
    return map;
  }, [catalogSongs]);

  useEffect(() => {
    if (!venueDbId) return;

    type VenueSongRow = {
      play_count: number;
      in_venue_list: boolean;
      playlist_visible: boolean;
      songs: Omit<VenueSong, "play_count" | "in_venue_list"> | null;
    };

    let subscribedOnce = false;

    const fetchVenueSongs = async () => {
      // Sayfalı: 1000'i aşan kataloglarda müşteri şarkıların tamamını göremiyordu
      const { data: vSongs } = await fetchAllRows<VenueSongRow>((from, to) =>
        supabase
          .from("venue_songs")
          .select("play_count, in_venue_list, playlist_visible, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
          .eq("venue_id", venueDbId)
          .order("song_id", { ascending: true })
          .range(from, to)
      );

      {
        const rows = vSongs;
        // Müşteriye pasif listedeki şarkı seçilemez (0040) — liste pasife alınınca
        // venue_songs satırları değiştiği için bu tazeleme realtime ile tetiklenir
        setVenueSongs(
          rows
            .filter((vs) => vs.songs)
            .map((vs) => ({
              ...vs.songs!,
              play_count: vs.play_count,
              in_venue_list: vs.in_venue_list && vs.playlist_visible,
            }))
        );
      }
    };

    // Kabuk cache'li (lib/venue-cache.ts, cacheLife "minutes") ve realtime yalnızca
    // AÇIK sekmeye olayı iletir. İkisi birden ıskalanabildiği için — telefon uykuya
    // gitmiş, PWA arka planda, socket kopmuş — açılışta ve her (yeniden) bağlanışta
    // katalog kaynaktan bir kez okunur. Aksi halde müşteri, mekanın müşteriye
    // kapattığı bir listenin şarkısını sıralı sanmaya devam ediyordu.
    fetchVenueSongs();

    const channel = supabase
      .channel(`browse-venue-songs:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_songs", filter: `venue_id=eq.${venueDbId}` }, fetchVenueSongs)
      .subscribe((status: string) => {
        // İlk SUBSCRIBED yukarıdaki okumayla aynı ana denk gelir; yalnızca kopup
        // dönen bağlantılarda (aradaki olaylar kayıp) tazeleme yapılır.
        if (status === "SUBSCRIBED") {
          if (subscribedOnce) fetchVenueSongs();
          subscribedOnce = true;
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueDbId, supabase]);

  // Onaylanan talepler: mekan admini bir talebi kabul edince şarkı 10 dakikalığına
  // herkese açılır ve İLK ekleyen hakkı tüketir (bkz. 0045 request_song).
  // Katalogdan ayrı yaşadığı için ayrı okunur; realtime + saniyelik saat ile
  // hem beliriyor hem süresi dolunca kayboluyor.
  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    type OneTimeRow = {
      expires_at: string;
      songs: Omit<VenueSong, "play_count" | "in_venue_list"> | null;
    };

    const fetchOneTime = async () => {
      const { data } = await supabase
        .from("one_time_songs")
        .select("expires_at, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueDbId)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true });

      if (cancelled) return;
      setOneTimeSongs(
        ((data ?? []) as unknown as OneTimeRow[])
          .filter((r) => r.songs)
          .map((r) => ({
            ...r.songs!,
            play_count: 0,
            in_venue_list: true,
            one_time_expires_at: r.expires_at,
          }))
      );
    };

    fetchOneTime();

    const channel = supabase
      .channel(`browse-one-time:${venueDbId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "one_time_songs", filter: `venue_id=eq.${venueDbId}` }, fetchOneTime)
      .subscribe();

    // Süresi dolanı listeden düşür (sunucu tarafı zaten reddeder; ekran da yalan
    // söylemesin) ve geri sayımları tazele
    const sweep = setInterval(() => {
      setOneTimeTick(Date.now());
      setOneTimeSongs((prev) => {
        const now = Date.now();
        const alive = prev.filter((s) => new Date(s.one_time_expires_at!).getTime() > now);
        return alive.length === prev.length ? prev : alive;
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(sweep);
      supabase.removeChannel(channel);
    };
  }, [venueDbId, supabase]);

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    // Kullanıcı + canlı durum tek round-trip (0006'daki RPC): kuyruktakiler,
    // son çalınanlar, bakiye, favoriler, bekleme süresi girdileri
    const fetchUserState = async () => {
      // started_at RPC'de yok ama bekleme süresi/ilerleme için şart: DB'deki
      // progress_ms 15 sn'de bir yazıldığından bayat, started_at ise sabit çapa
      const [{ data }, { data: npRow }] = await Promise.all([
        supabase.rpc("get_browse_user_state", { p_venue_id: venueDbId }),
        supabase.from("now_playing").select("started_at, is_playing").eq("venue_id", venueDbId).maybeSingle(),
      ]);
      if (cancelled) return;
      if (!data) {
        // Hata durumunda eldeki veri korunur ama iskelet takılı kalmaz
        setStateLoaded(true);
        return;
      }
      const state = data as unknown as BrowseUserState;
      const np2 = npRow as { started_at: string | null; is_playing: boolean } | null;

      setQueuedSongIds(new Set(state.queued_song_ids ?? []));
      setTokenBalance(state.token_balance ?? 0);
      setFavoriteIds(new Set(state.favorite_ids ?? []));
      setQueueEntries(state.queue_entries ?? []);
      setRecentPlays(state.recently_played ?? []);
      // Hem banner hem "eklenemez" kilidi buradan: kaynak kuyruğun 'playing' satırı —
      // request_song'ın baktığı yerin aynısı (auto çalmalar da dahil). Satır yoksa
      // now_playing tablosuna düşülür.
      setPlayingSongId(state.playing?.song_id ?? state.now_playing?.song_id ?? null);
      setNowPlaying(
        state.now_playing
          ? { ...state.now_playing, started_at: np2?.is_playing ? np2.started_at : null }
          : null
      );

      // recently_played artık çalmakta olan müşteri şarkısını da içeriyor ve çapası
      // çalmaya başlama anı (0025) — sahnedeki şarkının ayrı bloğu playingSongId'de
      setRecentlyPlayedIds(new Map((state.recently_played ?? []).map((r) => [r.song_id, r.played_at])));
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

  const { progressMs, remainingMs: remainingCurrentMs } = useNowPlayingClock(nowPlaying);

  const songById = useMemo(() => {
    const map = new Map<string, VenueSong>();
    catalogSongs.forEach((s) => map.set(s.id, s));
    return map;
  }, [catalogSongs]);

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
    for (const s of catalogSongs) {
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
  }, [catalogSongs]);

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

  // Sahnedeki şarkı müşteriye kapalı bir listeden geliyor olabilir (otomatik çalma
  // bu kuraldan etkilenmez). Banner yalnızca bilgi gösterir — eklenemez — bu yüzden
  // katalog dışına, mekanın tüm şarkılarına da bakılır.
  const nowPlayingSong = useMemo(() => {
    if (!playingSongId) return undefined;
    return songById.get(playingSongId) ?? venueSongs.find((s) => s.id === playingSongId);
  }, [playingSongId, songById, venueSongs]);

  // Gözat listesi hiçbir zaman kısacık kalmasın: en çok çalınanlar 20'yi
  // doldurmuyorsa (yeni mekanda hiç çalma verisi yok) kalanı müşteriye AÇIK diğer
  // şarkılarla tamamlanır. Kaynak zaten süzülmüş: kapalı şarkı buraya da girmez.
  // Sıra kararlı tutulur (katalog sırası) — rastgele seçim SSR/hydration'ı bozar.
  const defaultListSongs = useMemo(() => {
    const playable = venueSongs.filter((s) => s.in_venue_list);
    const list = playable
      .filter((s) => s.play_count > 0)
      .sort((a, b) => b.play_count - a.play_count)
      .slice(0, MIN_LIST_SONGS);
    if (list.length < MIN_LIST_SONGS) {
      const seen = new Set(list.map((s) => s.id));
      for (const s of playable) {
        if (list.length >= MIN_LIST_SONGS) break;
        if (seen.has(s.id)) continue;
        list.push(s);
      }
    }
    return list;
  }, [venueSongs]);

  // Liste hiç çalınmamış şarkılarla dolduysa "En Çok Çalınanlar" başlığı yalan olur
  const listAllPlayed = useMemo(() => defaultListSongs.every((s) => s.play_count > 0), [defaultListSongs]);

  // Sanatçı seçiliyken onun şarkıları; değilse mekanın gözat listesi
  const listSongs = useMemo(() => {
    if (!selectedArtist) return defaultListSongs;
    const result = catalogSongs.filter((s) => artistKey(s.artist) === selectedArtist);
    if (sortBy === "az") result.sort((a, b) => a.title.localeCompare(b.title, "tr"));
    else if (sortBy === "plays") result.sort((a, b) => b.play_count - a.play_count);
    return result;
  }, [catalogSongs, selectedArtist, sortBy, defaultListSongs]);

  const selectedArtistName = selectedArtist
    ? artists.find((a) => a.key === selectedArtist)?.name ??
      (listSongs[0] ? primaryArtist(listSongs[0].artist) : selectedArtist)
    : null;

  const favoriteSongs = useMemo(
    () => catalogSongs.filter((s) => favoriteIds.has(s.id)).slice(0, 10),
    [catalogSongs, favoriteIds]
  );

  const actionFor = useCallback(
    (song: DisplaySong) =>
      getSongActionState(song, { queuedSongIds, recentlyPlayedAt: recentlyPlayedIds, playingSongId, addedIds, requestedIds, playerOffline }),
    [queuedSongIds, recentlyPlayedIds, playingSongId, addedIds, requestedIds, playerOffline]
  );

  // Şansına bırak: cooldown'da/kuyrukta olmayan listeden rastgele bir şarkıyla sheet'i aç
  const luckyPick = useCallback(async () => {
    if (playerOffline) return;
    const eligible = catalogSongs.filter((s) => s.in_venue_list && actionFor(s).kind === "add");
    if (eligible.length === 0) return;
    // Şarkı hesap adımından ÖNCE seçilir: misafir oturumu açılamayıp giriş
    // ekranına düşülse bile dönüşte aynı şarkının kartı kendiliğinden açılsın
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    if (!(await requireAccount())) {
      savePendingAdd(venueId, pick.youtube_video_id);
      return;
    }
    setSelectedSong(pick);
  }, [catalogSongs, actionFor, requireAccount, playerOffline, venueId]);

  const openSong = useCallback(
    (song: DisplaySong) => router.push(`/venue/${venueId}/song/${song.youtube_video_id}`),
    [router, venueId]
  );

  // Sıraya ekleme, istek, favori ve jeton hesaba bağlı — misafir giriş ekranına gider
  const openSheet = useCallback(
    async (song: DisplaySong) => {
      // Oynatıcı kapalıyken sheet hiç açılmaz: eklenen şarkı çalmayacağı için
      // jeton boşa gider (aynı kural sunucuda /api/queue içinde)
      if (playerOffline) return;
      // Hesabı olmayan için misafir oturumu sessizce açılır ve kart aynı
      // dokunuşta gelir. Yalnızca o da olmazsa giriş ekranına gidilir; hangi
      // şarkı için gidildiği saklanır (bkz. lib/pending-add.ts).
      if (!(await requireAccount())) {
        savePendingAdd(venueId, song.youtube_video_id);
        return;
      }
      setSelectedSong(song);
    },
    [requireAccount, playerOffline, venueId]
  );

  // İLK ZİYARET: mekana yeni giren kişiye anlatım metni okutulmaz, doğrudan işin
  // başına oturtulur — arama kendiliğinden açılır. Aradığı şarkı listedeyse
  // ekleme kartına, listede yoksa aynı ekrandaki talep kutusuna düşer; jeton
  // adımı ancak ondan sonra (ekleme kartındaki yükleme çağrısıyla) gelir.
  // İkinci açılışta artık çıkmaz (bkz. lib/first-visit.ts).
  // İşaret localStorage'da: sunucu render'ında bilinemez, bu yüzden karar ancak
  // bağlandıktan sonra verilebilir (state'i başlangıç değerinden okumak
  // hidrasyon uyuşmazlığı olurdu).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tek seferlik açılış kararı
    if (takeFirstVisit(venueId)) setSearchOpen(true);
  }, [venueId]);

  // Jeton almaya gidip dönen müşteri şarkıyı baştan aramasın: gidilirken saklanan
  // şarkının ekleme kartı bir kez kendiliğinden açılır (bkz. lib/pending-add.ts).
  // Ekleme yapılmaz — son dokunuş yine müşteride.
  const pendingAddCheckedRef = useRef(false);
  useEffect(() => {
    if (!stateLoaded || pendingAddCheckedRef.current || playerOffline) return;
    if (venueSongMap.size === 0) return;
    pendingAddCheckedRef.current = true;
    const pending = takePendingAdd(venueId);
    if (!pending) return;
    const song = venueSongMap.get(pending.videoId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jeton dönüşündeki tek seferlik açılış
    if (song) setSelectedSong(song);
  }, [stateLoaded, playerOffline, venueSongMap, venueId]);

  // Talep şeridi zaten gözat sayfasındayken "Sıraya Ekle"ye basıldığında sayfa
  // yeniden mount olmaz — kart bu olayla açılır (bkz. RequestStatusBar).
  const [addSignal, setAddSignal] = useState(0);
  useEffect(() => {
    const onSignal = () => setAddSignal(Date.now());
    window.addEventListener("pmj-open-pending-add", onSignal);
    return () => window.removeEventListener("pmj-open-pending-add", onSignal);
  }, []);

  useEffect(() => {
    if (!addSignal || playerOffline) return;
    const pending = peekPendingAdd(venueId);
    if (!pending) return;
    // Yeni onaylanan tek seferlik şarkı listeye realtime ile düşüyor; henüz
    // gelmediyse kayıt DURUR, liste güncellenince bu efekt tekrar dener
    const song = venueSongMap.get(pending.videoId);
    if (!song) return;
    clearPendingAdd(venueId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- şeritten gelen tek seferlik açılış
    setSelectedSong(song);
  }, [addSignal, playerOffline, venueSongMap, venueId]);

  // Alt gezinmedeki jeton rozeti bu sayfanın okuduğu bakiyeyi kullanır (ayrı sorgu yok)
  useEffect(() => {
    if (stateLoaded) publishTokenBalance(tokenBalance);
  }, [stateLoaded, tokenBalance]);

  // Öncelikli ücret sıraya göre değişir: bekleyen her 3 normal şarkı için +1 jeton
  // (aynı formül sunucuda priority_cost_now içinde — bkz. lib/pricing.ts).
  // queueEntries realtime tazelendiği için gösterilen fiyat da canlı.
  const dynamicPriorityCost = useMemo(
    () => priorityCostFor(priorityCost, normalQueuedCount(queueEntries)),
    [priorityCost, queueEntries]
  );

  const handleAdd = async (priority: boolean) => {
    if (!selectedSong || !venueDbId || !selectedSong.id) return;
    if (isAddingRef.current) return;
    isAddingRef.current = true;

    // Optimistic update: close sheet and update UI immediately
    // (gerçek düşüm RPC'de yapılır; öncelikli ücret kuyruğa bağlı olduğu için
    //  yanıt gelince aradaki fark düzeltilir)
    const cost = priority ? dynamicPriorityCost : requestCost;
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

    if (res.ok) {
      // Başkası tam bu sırada şarkı eklediyse kesilen ücret gösterilenden farklı
      // olabilir — gerçek tutarla eşitle
      const charged = await res.json().then((d) => d?.cost).catch(() => null);
      if (typeof charged === "number" && charged !== cost) {
        setTokenBalance((b) => b + cost - charged);
      }
    } else {
      // Rollback on error
      setTokenBalance((b) => b + cost);
      setAddedIds((s) => { const n = new Set(s); n.delete(videoId); return n; });
      setQueuedSongIds((s) => { const n = new Set(s); n.delete(songId); return n; });
      // Oturum bu arada düşmüş olabilir (çerez süresi/başka cihazdan çıkış)
      if (res.status === 401 || res.status === 403) {
        router.push(venueLoginPath(venueId, `/venue/${venueId}/browse`));
      }
    }
    isAddingRef.current = false;
  };

  const handleRequest = useCallback(async (song: DisplaySong) => {
    if (!venueDbId) return;
    if (!(await requireAccount())) return;

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
  }, [venueDbId, venueId, requireAccount]);

  const sendSuggestion = useCallback(
    async (title: string, artist: string, cover?: string): Promise<SuggestResult> => {
      try {
        const res = await fetch(`/api/venue/${venueId}/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Kapak yalnızca mekana giden bildirimin ikonu olur, kayda yazılmaz
          body: JSON.stringify({ suggested_title: title, suggested_artist: artist, suggested_cover_url: cover }),
        });
        if (res.ok) {
          // Durum şeridi beklemeden belirsin (bkz. components/venue/RequestStatusBar)
          window.dispatchEvent(new Event("pmj-suggestion-sent"));
          return "ok";
        }
        if (res.status === 429) return "limit";
        if (res.status === 401 || res.status === 403) return "auth";
        return "error";
      } catch {
        return "error";
      }
    },
    [venueId]
  );

  // Mekan listesinde bulunamayan şarkı için serbest metin talep — jeton harcamaz,
  // mekanın istekler bölümüne düşer (bkz. /api/venue/[venueId]/request).
  //
  // Misafirse talep giriş öncesi saklanır: hesabına girip gözat sayfasına
  // döndüğünde kendiliğinden gönderilir, kullanıcı aramayı baştan yapmaz.
  const handleSuggest = useCallback(async (title: string, artist: string, cover?: string): Promise<SuggestResult> => {
    if (!(await requireAccount(`/venue/${venueId}/browse`))) {
      savePendingSuggestion(venueId, title, artist, cover);
      return "auth";
    }

    const result = await sendSuggestion(title, artist, cover);
    if (result === "auth") {
      // Oturum bu arada düşmüş: talep saklanır, girişten sonra kendiliğinden gider
      savePendingSuggestion(venueId, title, artist, cover);
      router.push(venueLoginPath(venueId, `/venue/${venueId}/browse`));
    }
    return result;
  }, [venueId, requireAccount, router, sendSuggestion]);

  // Bildirim izni verilmiş ama sunucuda abonelik kaydı yoksa geri yaz.
  // (Kayıt kaybolduğunda kullanıcı bunu ancak beklediği bildirim gelmeyince
  // fark ediyordu — sessizce onarılıyor.)
  useEffect(() => {
    if (!isMember) return;
    refreshPushSubscription();
  }, [isMember]);

  // Girişten dönüş: saklanan talep varsa gönder ve sonucu üstte bildir
  useEffect(() => {
    if (!isMember) return;
    const pending = takePendingSuggestion(venueId);
    if (!pending) return;

    let cancelled = false;
    (async () => {
      const result = await sendSuggestion(pending.title, pending.artist, pending.cover);
      if (cancelled) return;
      // 'auth' burada da gelirse çerez var ama sunucu kabul etmiyor demektir;
      // kullanıcıyı döngüye sokmamak için hata olarak gösterilir
      setSuggestFlash({
        state: result === "ok" || result === "duplicate" ? "sent" : "error",
        title: pending.title,
        artist: pending.artist,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isMember, venueId, sendSuggestion]);

  const toggleFavorite = useCallback(async (song: DisplaySong) => {
    if (!song.id) return;
    if (!(await requireAccount())) return;
    // Misafir oturumu tam bu dokunuşta açılmış olabilir: kimlik mount anındaki
    // ref'te yoksa tazeden okunur
    let userId = userIdRef.current;
    if (!userId) {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user?.id ?? null;
      userIdRef.current = userId;
    }
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
  }, [favoriteIds, supabase, requireAccount]);

  const waitNormalMs = useMemo(
    () => waitMs(remainingCurrentMs, queueEntries, false),
    [queueEntries, remainingCurrentMs]
  );
  const waitPriorityMs = useMemo(
    () => waitMs(remainingCurrentMs, queueEntries, true),
    [queueEntries, remainingCurrentMs]
  );

  const sortOptions = [
    { key: "default", label: t.browse.sortDefault },
    { key: "az", label: t.browse.sortAz },
    { key: "plays", label: t.browse.sortPlays },
  ] as const;

  return (
    <div className="w-full bg-[#0f0a18]">
      {/* Sticky başlık + sahte arama çubuğu (dokununca tam ekran arama açılır) */}
      <div className="sticky top-0 z-30 bg-[#0f0a18]/95 px-5 pb-3 pt-12 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">{t.browse.title}</h1>
          <div className="flex items-center gap-2">
          {/* Dil anahtarı yalnızca misafirde başlıkta: üye onu profil sayfasından
              değiştirir, başlık üç düğmeyle kalabalıklaşmasın */}
          {!isMember && <LangToggle />}
          {isMember ? (
            <Link
              href={`/venue/${venueId}/tokens`}
              className="flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-[#1a0e2a] px-3 transition-transform active:scale-95"
              aria-label={t.browse.balanceAria}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fbbf24" strokeWidth="2" /><circle cx="12" cy="12" r="4" stroke="#fbbf24" strokeWidth="2" /></svg>
              {stateLoaded ? (
                <span className="text-sm font-bold text-white">{tokenBalance}</span>
              ) : (
                <span className="h-3.5 w-4 animate-pulse rounded bg-white/10" />
              )}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </Link>
          ) : (
            /* Misafirde bakiye yok — çip doğrudan giriş ekranına götürür */
            <Link
              href={venueLoginPath(venueId, `/venue/${venueId}/browse`)}
              className="flex h-8 items-center gap-1.5 rounded-full border border-[#e91e8c]/40 bg-[#e91e8c]/15 px-3 transition-transform active:scale-95"
            >
              <span className="text-xs font-bold text-white">{t.queue.login}</span>
            </Link>
          )}
          {/* Profil artık alt gezinmede değil — her sayfanın sağ üstünde */}
          <ProfileChip venueId={venueId} />
          </div>
        </div>
        {/* Arama sayfanın ana eylemi: gradyan çerçeve + parıltı ile öne çıkarılır.
            Arama tamamen mekanın kendi listesinde (YouTube'a çıkmaz), misafire de açık —
            listede olmayan şarkı için altındaki ipucu talep akışına işaret eder. */}
        <div className="flex gap-2">
          <div
            className="min-w-0 flex-1 rounded-2xl p-[1.5px] shadow-[0_0_20px_rgba(233,30,140,0.28)]"
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-[45px] w-full items-center gap-3 rounded-[14px] bg-[#1a0e2a] px-4 text-left transition-transform active:scale-[0.98]"
            >
              <svg className="shrink-0" width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#e91e8c" strokeWidth="2.2" /><path d="M20 20l-3-3" stroke="#e91e8c" strokeWidth="2.2" strokeLinecap="round" /></svg>
              <span className="truncate text-sm font-semibold text-white">{t.browse.searchPlaceholder}</span>
            </button>
          </div>
          <button
            onClick={luckyPick}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#e91e8c]/30 bg-[#1a0e2a] transition-transform active:scale-95"
            aria-label={t.browse.luckyAria}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {/* Listede olmayan şarkının da çalınabildiği en görünür yerde söylenir */}
        <button
          onClick={() => setSearchOpen(true)}
          className="mt-2 flex w-full items-center gap-1.5 text-left"
        >
          <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l2.2 5.6L20 10l-5.8 1.4L12 17l-2.2-5.6L4 10l5.8-1.4L12 3z" fill="#fbbf24" /></svg>
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-[#c4b5d4]">{t.browse.searchHint}</span>
        </button>
      </div>

      <div className="pt-4">
        {playerOffline && (
          <div className="mb-6 px-5">
            <PlayerOfflineNotice />
          </div>
        )}

        {!selectedArtist && nowPlayingSong && nowPlaying && (
          <div className="mb-6 px-5">
            <NowPlayingBanner
              song={nowPlayingSong}
              progressMs={progressMs}
              durationMs={nowPlaying.duration_ms}
              isPlaying={nowPlaying.is_playing && !playerOffline}
              /* Oynatıcı kapalıyken ilerleme donmuş olur — çubuk gösterilmez */
              showProgress={!playerOffline}
              onClick={() => router.push(`/venue/${venueId}/queue`)}
            />
          </div>
        )}

        {/* Girişten sonra kendiliğinden gönderilen talebin sonucu */}
        {suggestFlash && (
          <div className="mb-6 px-5">
            <div
              className="rounded-2xl border p-4"
              style={
                suggestFlash.state === "sent"
                  ? { borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.1)" }
                  : { borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)" }
              }
            >
              <div className="flex items-start gap-2">
                {suggestFlash.state === "sent" ? (
                  <svg className="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <svg className="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="2" /><path d="M12 7v6M12 16.5v.5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">
                    {suggestFlash.state === "sent" ? t.suggest.sentTitle : t.suggest.sendError}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[#9ca3af]">
                    {suggestFlash.title} — {suggestFlash.artist}
                  </p>
                  {suggestFlash.state === "sent" && (
                    <p className="mt-1.5 text-xs text-[#9ca3af]">{t.suggest.sentDesc}</p>
                  )}
                </div>
                <button
                  onClick={() => setSuggestFlash(null)}
                  className="shrink-0 p-1"
                  aria-label={t.common.close}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
              {suggestFlash.state === "sent" && <NotifyOptIn />}
            </div>
          </div>
        )}

        {/* Mekanın onayladığı talepler: tek seferlik, süreli. İlk ekleyen alır. */}
        {!selectedArtist && oneTimeSongs.length > 0 && (
          <section className="mb-6 px-5">
            <div className="rounded-2xl border border-[#fbbf24]/30 bg-[#fbbf24]/[0.06] px-4 py-3.5">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fbbf24" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" /></svg>
                <h2 className="text-base font-bold text-white">{t.oneTime.heading}</h2>
              </div>
              <p className="mt-1 text-xs text-[#9ca3af]">{t.oneTime.desc}</p>
              <div className="mt-2">
                {oneTimeSongs.map((song) => {
                  const leftMs = Math.max(0, new Date(song.one_time_expires_at!).getTime() - oneTimeTick);
                  const mins = Math.floor(leftMs / 60000);
                  const secs = Math.floor((leftMs % 60000) / 1000);
                  return (
                    <div key={song.youtube_video_id}>
                      <p className="pt-2 text-[11px] font-semibold text-[#fbbf24]">
                        {fmt(t.oneTime.remaining, { t: `${mins}:${secs.toString().padStart(2, "0")}` })}
                      </p>
                      <SongRow
                        song={song}
                        action={actionFor(song)}
                        isFav={favoriteIds.has(song.id)}
                        showPlayCount={false}
                        onOpen={openSong}
                        onToggleFavorite={toggleFavorite}
                        onAdd={openSheet}
                        onRequest={handleRequest}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {!selectedArtist && favoriteSongs.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#e91e8c"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                <h2 className="text-base font-bold text-white">{t.browse.favorites}</h2>
              </div>
              <Link href={`/venue/${venueId}/favorites`} className="text-xs font-semibold text-[#e91e8c]">
                {t.browse.seeAll}
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
              <h2 className="text-base font-bold text-white">{t.browse.mostRequested}</h2>
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
              <h2 className="text-base font-bold text-white">{t.browse.artists}</h2>
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
              <h2 className="text-base font-bold text-white">{t.browse.recentlyPlayed}</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto px-5">
              {recentSongs.map((song) => (
                <SongCard key={song.youtube_video_id} song={song} action={actionFor(song)} onOpen={openSong} onAdd={openSheet} onRequest={handleRequest} />
              ))}
            </div>
          </section>
        )}

        <section className="px-5 pb-6">
          <div className="mb-1 flex items-center justify-between">
            {selectedArtist ? (
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-bold text-white">{selectedArtistName}</h2>
                <span className="shrink-0 text-xs text-[#9ca3af]">{fmt(t.browse.songCount, { n: listSongs.length })}</span>
                <button
                  onClick={() => setSelectedArtist(null)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10"
                  aria-label={t.browse.clearArtistAria}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            ) : (
              <h2 className="text-base font-bold text-white">
                {listAllPlayed ? t.browse.mostPlayed : t.browse.songs}
              </h2>
            )}
            {selectedArtist && (
              <div className="relative">
                <button
                  onClick={() => setSortOpen((v) => !v)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${sortOpen || sortBy !== "default" ? "border border-[#e91e8c]/40 bg-[#e91e8c]/20" : "bg-white/10"}`}
                  aria-label={t.browse.sortAria}
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
              {/* Liste artık çalma verisine bağlı değil: boşsa mekanın müşteriye
                  açık hiç şarkısı yok demektir */}
              {t.browse.noSongsFound}
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
          /* Kutu boşken arama ekranı boş kalmasın: gözat sayfasının zaten
             hesapladığı sanatçı şeridi ve şarkı listesi olduğu gibi verilir */
          suggestedArtists={artists}
          suggestedSongs={defaultListSongs}
          onOpen={openSong}
          onToggleFavorite={toggleFavorite}
          onAdd={openSheet}
          onRequest={handleRequest}
          onSuggest={handleSuggest}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <AddSongSheet
        song={selectedSong}
        tokenBalance={tokenBalance}
        cooldown={selectedSong ? getCooldown(selectedSong, { queuedSongIds, recentlyPlayedAt: recentlyPlayedIds, playingSongId }) : undefined}
        waitNormalMs={waitNormalMs}
        waitPriorityMs={waitPriorityMs}
        normalCost={requestCost}
        priorityCost={dynamicPriorityCost}
        basePriorityCost={priorityCost}
        tokenUnitPrice={tokenUnitPrice}
        onClose={() => setSelectedSong(null)}
        onAdd={handleAdd}
      />
    </div>
  );
}
