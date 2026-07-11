"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import SongRow from "./SongRow";
import type { DisplaySong, SongActionState, VenueSong } from "./browse-types";

const MAX_RECENT = 8;

interface Props {
  venueSongMap: Map<string, VenueSong>;
  favoriteIds: Set<string>;
  actionFor: (song: DisplaySong) => SongActionState;
  recentKey: string;
  onOpen: (song: DisplaySong) => void;
  onToggleFavorite: (song: DisplaySong) => void;
  onAdd: (song: DisplaySong) => void;
  onRequest: (song: DisplaySong) => void;
  onClose: () => void;
}

export default function SearchView({ venueSongMap, favoriteIds, actionFor, recentKey, onOpen, onToggleFavorite, onAdd, onRequest, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DisplaySong[]>([]);
  const [searching, setSearching] = useState(false);
  // Yalnızca kullanıcı etkileşimiyle mount olur; yine de SSR guard'ı korunuyor
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(recentKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((r): r is string => typeof r === "string");
      }
    } catch {
      // bozuk kayıt — yok say
    }
    return [];
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Arka plandaki gözat listesi unmount olmaz — body scroll kilidi
  // sayesinde arama kapanınca kaldığın yerden devam edersin
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const persistRecent = (items: string[]) => {
    setRecent(items);
    try {
      localStorage.setItem(recentKey, JSON.stringify(items));
    } catch {
      // storage dolu/kapalı — sessizce geç
    }
  };

  const saveRecent = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const key = t.toLocaleLowerCase("tr");
    persistRecent([t, ...recent.filter((r) => r.toLocaleLowerCase("tr") !== key)].slice(0, MAX_RECENT));
  };

  const removeRecent = (term: string) => {
    persistRecent(recent.filter((r) => r !== term));
  };

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
    if (!value.trim()) { setSearchResults([]); setSearching(false); return; }
    // Debounce beklerken de spinner görünsün — erken "Sonuç bulunamadı" yanıltmasın
    setSearching(true);
    debounceRef.current = setTimeout(() => searchSpotify(value), 400);
  };

  const submitQuery = (term: string) => {
    setQuery(term);
    saveRecent(term);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchSpotify(term);
  };

  // Yerel sonuçlar debounce beklemeden gelsin; deferred değer yazmayı bloklamasın
  const deferredQuery = useDeferredValue(query);

  // Mekan listesindeki eşleşmeler — Spotify yanıtını beklemeden anında gösterilir
  const localResults = useMemo<DisplaySong[]>(() => {
    const q = deferredQuery.trim().toLocaleLowerCase("tr");
    if (!q) return [];
    const matches: VenueSong[] = [];
    for (const s of venueSongMap.values()) {
      if (!s.in_venue_list) continue;
      if (s.title.toLocaleLowerCase("tr").includes(q) || s.artist.toLocaleLowerCase("tr").includes(q)) {
        matches.push(s);
      }
    }
    return matches.sort((a, b) => b.play_count - a.play_count).slice(0, 20);
  }, [deferredQuery, venueSongMap]);

  // Spotify sonuçlarını mekan kataloğu metadata'sıyla birleştir (cooldown/istek durumu için),
  // yerel bölümde zaten görünenleri ele
  const spotifyResults = useMemo<DisplaySong[]>(() => {
    const localIds = new Set(localResults.map((s) => s.spotify_track_id));
    return searchResults
      .filter((r) => !localIds.has(r.spotify_track_id))
      .map((r) => {
        const vs = venueSongMap.get(r.spotify_track_id);
        return { ...r, id: vs?.id, play_count: vs?.play_count, in_venue_list: vs?.in_venue_list };
      });
  }, [searchResults, venueSongMap, localResults]);

  const interact = <T,>(fn: (arg: T) => void) => (arg: T) => {
    saveRecent(query);
    fn(arg);
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0a18]">
      <div className="flex items-center gap-2 px-4 pb-3 pt-12">
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          aria-label="Aramayı kapat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            autoFocus
            placeholder="Şarkı, sanatçı ara..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                submitQuery(query);
                inputRef.current?.blur();
              }
            }}
            className="w-full rounded-2xl border border-white/10 bg-[#1a0e2a] py-3.5 pl-4 pr-10 text-sm text-white outline-none placeholder:text-[#6b7280]"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setSearchResults([]); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 flex -translate-y-1/2 p-1"
              aria-label="Temizle"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        {!hasQuery ? (
          recent.length > 0 ? (
            <>
              <div className="mb-1 flex items-center justify-between pt-2">
                <h2 className="text-sm font-bold text-white">Son Aramalar</h2>
                <button onClick={() => persistRecent([])} className="text-xs font-medium text-[#9ca3af]">
                  Temizle
                </button>
              </div>
              {recent.map((term) => (
                <div key={term} className="flex items-center gap-3 border-b border-white/5">
                  <button onClick={() => submitQuery(term)} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 text-left">
                    <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#6b7280" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                    <span className="truncate text-sm text-white">{term}</span>
                  </button>
                  <button
                    onClick={() => removeRecent(term)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    aria-label={`"${term}" aramasını sil`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center pt-16 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#3d3450" strokeWidth="2" /><path d="M20 20l-3-3" stroke="#3d3450" strokeWidth="2" strokeLinecap="round" /></svg>
              <p className="mt-3 text-sm text-[#6b7280]">Spotify&apos;da şarkı veya sanatçı ara</p>
            </div>
          )
        ) : (
          <>
            {localResults.length > 0 && (
              <>
                <h2 className="pt-2 text-sm font-bold text-white">Mekan Listesi</h2>
                {localResults.map((song) => (
                  <SongRow
                    key={song.spotify_track_id}
                    song={song}
                    action={actionFor(song)}
                    isFav={song.id ? favoriteIds.has(song.id) : false}
                    onOpen={interact(onOpen)}
                    onToggleFavorite={onToggleFavorite}
                    onAdd={interact(onAdd)}
                    onRequest={interact(onRequest)}
                  />
                ))}
              </>
            )}

            <div className="flex items-center gap-2 pt-4">
              <h2 className="text-sm font-bold text-white">Spotify Sonuçları</h2>
              {searching && (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#6b7280" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
              )}
            </div>
            {spotifyResults.map((song) => (
              <SongRow
                key={song.spotify_track_id}
                song={song}
                action={actionFor(song)}
                isFav={song.id ? favoriteIds.has(song.id) : false}
                onOpen={interact(onOpen)}
                onToggleFavorite={onToggleFavorite}
                onAdd={interact(onAdd)}
                onRequest={interact(onRequest)}
              />
            ))}
            {!searching && spotifyResults.length === 0 && (
              <p className="py-8 text-center text-sm text-[#6b7280]">
                {localResults.length > 0 ? "Spotify'da başka sonuç bulunamadı" : "Sonuç bulunamadı"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
