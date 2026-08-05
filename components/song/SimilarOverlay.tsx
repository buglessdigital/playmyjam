"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import SongActionButton from "@/components/browse/SongActionButton";
import {
  COOLDOWN_MS,
  getCooldown,
  getSongActionState,
  primaryArtist,
  type Cooldown,
  type DisplaySong,
  type SongActionState,
  type VenueSong,
} from "@/components/browse/browse-types";
import { buildSimilar, similarSongsOfArtist, type SimilarArtist } from "@/lib/similar";
import { useT } from "@/lib/i18n";

interface Props {
  venueDbId: string;
  track: { youtube_video_id: string; title: string; artist: string; album_cover_url: string; duration_ms: number };
  /** Kullanıcı kuyruğundaki şarkı id'leri (üst bileşende realtime güncellenir) */
  queuedSongIds: Set<string>;
  /** Şu an çalan şarkı — cooldown'da sayılır, "ekle" gösterilmez */
  playingSongId: string | null;
  /** Bu oturumda sıraya eklenen video id'leri */
  addedIds: Set<string>;
  onOpenSong: (song: DisplaySong) => void;
  onAddSong: (song: VenueSong, cooldown: Cooldown) => void;
  onClose: () => void;
}

type VenueSongRow = {
  play_count: number;
  in_venue_list: boolean;
  songs: Omit<VenueSong, "play_count" | "in_venue_list"> | null;
};

export default function SimilarOverlay({
  venueDbId, track, queuedSongIds, playingSongId, addedIds, onOpenSong, onAddSong, onClose,
}: Props) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const [catalog, setCatalog] = useState<VenueSong[] | null>(null);
  const [recentlyPlayedAt, setRecentlyPlayedAt] = useState<Map<string, number>>(new Map());
  const [selectedArtist, setSelectedArtist] = useState<SimilarArtist | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Katalog ve cooldown verisi yalnızca panel açıldığında çekilir — şarkı sayfasının
  // ilk yükü etkilenmez. Panel kapanıp açılırsa veri state'te kaldığı için anında gelir.
  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    const load = async () => {
      const [{ data: vSongs }, { data: played }] = await Promise.all([
        supabase
          .from("venue_songs")
          .select("play_count, in_venue_list, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
          .eq("venue_id", venueDbId),
        // request_song'daki cooldown kuralıyla birebir: yalnızca müşteri istekleri
        // sayılır ve sayaç şarkının çalmaya başladığı andan işler (0025). played_at
        // hep started_at'ten sonra olduğu için filtre üst küme, çapa aşağıda süzülür.
        // (Çalmakta olan şarkı ayrıca playingSongId ile engelli.)
        supabase
          .from("queue")
          .select("song_id, played_at, started_at")
          .eq("venue_id", venueDbId)
          .eq("status", "played")
          .not("user_id", "is", null)
          .gte("played_at", new Date(Date.now() - COOLDOWN_MS).toISOString()),
      ]);
      if (cancelled) return;

      const rows = (vSongs ?? []) as unknown as VenueSongRow[];
      setCatalog(
        rows
          .filter((vs) => vs.songs)
          .map((vs) => ({ ...vs.songs!, play_count: vs.play_count, in_venue_list: vs.in_venue_list }))
      );

      const playedRows = (played ?? []) as { song_id: string; played_at: string | null; started_at: string | null }[];
      const cutoff = Date.now() - COOLDOWN_MS;
      const anchors = new Map<string, number>();
      for (const r of playedRows) {
        const at = new Date(r.started_at ?? r.played_at ?? 0).getTime();
        if (at < cutoff) continue;
        anchors.set(r.song_id, Math.max(anchors.get(r.song_id) ?? 0, at));
      }
      setRecentlyPlayedAt(anchors);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [venueDbId, supabase]);

  // Üst bileşen çalma saatiyle her saniye yeniden render olduğu için bağımlılıklar
  // nesne değil ilkel değerler — katalog taraması yalnızca veri değişince çalışır
  const { youtube_video_id: videoId, title, artist, duration_ms } = track;
  const { songs, artists } = useMemo(
    () =>
      catalog
        ? buildSimilar({ youtube_video_id: videoId, title, artist, duration_ms }, catalog)
        : { songs: [], artists: [] },
    [catalog, videoId, title, artist, duration_ms]
  );

  const artistSongs = useMemo(
    () => (catalog && selectedArtist ? similarSongsOfArtist(catalog, selectedArtist.key) : []),
    [catalog, selectedArtist]
  );

  // Sahnedeki şarkı da eklenemez (request_song 'playing' ile reddeder) — "Çalıyor" rozeti
  const actionFor = (song: VenueSong): SongActionState =>
    getSongActionState(song, { queuedSongIds, recentlyPlayedAt, playingSongId, addedIds, requestedIds: new Set() });

  const handleAdd = (song: VenueSong) =>
    onAddSong(song, getCooldown(song, { queuedSongIds, recentlyPlayedAt, playingSongId }));

  const loading = catalog === null;
  const empty = !loading && songs.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "linear-gradient(180deg, #2a1a30 0%, #150c1f 45%, #0f0a18 100%)" }}
    >
      {/* Üst bar: hangi şarkının benzerlerine bakıldığı sürekli görünür */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 pb-3 pt-12">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#1a0e2a]">
          {track.album_cover_url && (
            <Image src={track.album_cover_url} alt={track.title} width={40} height={40} sizes="40px" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{track.title}</p>
          <p className="truncate text-xs text-[#9ca3af]">{track.artist}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"
          aria-label={t.similar.closeAria}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 pb-1 pt-4">
        {selectedArtist ? (
          <>
            <button
              onClick={() => setSelectedArtist(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10"
              aria-label={t.similar.backAria}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <h2 className="truncate text-lg font-bold text-white">{selectedArtist.name}</h2>
            <span className="shrink-0 text-xs text-[#9ca3af]">{artistSongs.length} şarkı</span>
          </>
        ) : (
          <h2 className="text-lg font-bold text-white">{t.similar.title}</h2>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {loading && (
          <div className="px-5 pt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-white/5" />
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-white/5" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {empty && (
          <p className="px-8 pt-16 text-center text-sm text-[#6b7280]">
            {t.similar.empty}
          </p>
        )}

        {!loading && selectedArtist && (
          <div className="px-5 pt-2">
            {artistSongs.map((song) => (
              <SimilarRow key={song.youtube_video_id} song={song} action={actionFor(song)} onOpen={onOpenSong} onAdd={handleAdd} />
            ))}
          </div>
        )}

        {!loading && !selectedArtist && songs.length > 0 && (
          <>
            <section className="pt-2">
              <h3 className="px-5 pb-1 text-sm font-bold text-white">{t.similar.songsTitle}</h3>
              <p className="px-5 pb-2 text-[11px] text-[#6b7280]">{t.similar.songsDesc}</p>
              <div className="px-5">
                {songs.map((song) => (
                  <SimilarRow key={song.youtube_video_id} song={song} action={actionFor(song)} onOpen={onOpenSong} onAdd={handleAdd} />
                ))}
              </div>
            </section>

            {artists.length > 0 && (
              <section className="pt-5">
                <h3 className="px-5 pb-1 text-sm font-bold text-white">{t.similar.artistsTitle}</h3>
                <p className="px-5 pb-3 text-[11px] text-[#6b7280]">{t.similar.artistsDesc}</p>
                <div className="flex gap-4 overflow-x-auto px-5 pb-2">
                  {artists.map((a) => (
                    <button
                      key={a.key}
                      onClick={() => setSelectedArtist(a)}
                      className="flex w-36 shrink-0 flex-col items-center gap-2 transition-transform active:scale-95"
                    >
                      {/* YouTube hqdefault kapağı 480x360'tır ve 16:9 videoda üst/alt %12,5
                          siyah bant içerir. scale-[1.35] bu bantları daire dışına taşır —
                          böylece daire tamamen görselle dolar. */}
                      <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-full bg-[#1a0e2a] ring-1 ring-white/10">
                        {a.coverUrl ? (
                          <Image src={a.coverUrl} alt={a.name} width={144} height={144} sizes="144px" className="h-full w-full scale-[1.35] object-cover" />
                        ) : (
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#6b7280" strokeWidth="2" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                        )}
                      </div>
                      <span className="w-full truncate text-center text-[17px] font-medium text-[#d1d5db]">{a.name}</span>
                      <span className="-mt-1 text-[13px] text-[#6b7280]">{a.songCount} şarkı</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SimilarRow({
  song, action, onOpen, onAdd,
}: {
  song: VenueSong;
  action: SongActionState;
  onOpen: (song: DisplaySong) => void;
  onAdd: (song: VenueSong) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 py-2.5">
      <button onClick={() => onOpen(song)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#1a0e2a]">
          {song.album_cover_url && (
            <Image src={song.album_cover_url} alt={song.title} width={48} height={48} sizes="48px" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{song.title}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-xs text-[#6b7280]">{primaryArtist(song.artist)}</span>
            {song.play_count > 0 && (
              <>
                <span className="text-xs text-[#6b7280]">•</span>
                <span className="shrink-0 text-xs font-medium text-[#e91e8c]">{song.play_count}</span>
              </>
            )}
          </div>
        </div>
      </button>
      <div className="shrink-0">
        {/* Yalnızca mekan listesindeki şarkılar gösterildiği için istek durumu oluşmaz */}
        <SongActionButton state={action} size="row" onAdd={() => onAdd(song)} onRequest={() => {}} />
      </div>
    </div>
  );
}
