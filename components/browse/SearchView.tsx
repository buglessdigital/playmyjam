"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SongRow from "./SongRow";
import NotifyOptIn from "./NotifyOptIn";
import { artistKey, primaryArtist, type DisplaySong, type SongActionState, type VenueSong } from "./browse-types";
import { fmt, useT } from "@/lib/i18n";
import LangToggle from "@/components/ui/LangToggle";

const MAX_RECENT = 8;

type SearchArtist = {
  key: string;
  name: string;
  coverUrl: string;
  songCount: number;
};

export type SuggestResult = "ok" | "duplicate" | "auth" | "limit" | "error";

interface Props {
  venueSongMap: Map<string, VenueSong>;
  favoriteIds: Set<string>;
  actionFor: (song: DisplaySong) => SongActionState;
  recentKey: string;
  /** Arama kutusu boşken gösterilecek sanatçılar (gözat sayfasının şeridiyle aynı) */
  suggestedArtists: SearchArtist[];
  /** Arama kutusu boşken gösterilecek şarkılar (gözat sayfasının ana listesi) */
  suggestedSongs: DisplaySong[];
  onOpen: (song: DisplaySong) => void;
  onToggleFavorite: (song: DisplaySong) => void;
  onAdd: (song: DisplaySong) => void;
  onRequest: (song: DisplaySong) => void;
  onSuggest: (title: string, artist: string) => Promise<SuggestResult>;
  onClose: () => void;
}

// Arama tamamen mekanın kendi listesi üzerinde çalışır (YouTube'a çıkılmaz).
// Aranan şarkı listede yoksa müşteri sanatçı + şarkı adını yazıp mekana öneri
// gönderir; öneri mekanın istekler bölümüne düşer.
//
// Ekran hiçbir zaman boş kalmaz: kutuya bir şey yazılmadan da mekanın müşteriye
// AÇIK sanatçı ve şarkıları listelenir. Yeni gelen aramaya ilk ziyarette
// kendiliğinden düştüğü için (bkz. lib/first-visit.ts) aklında bir şarkı yoksa
// bile dokunacak bir şey bulur.
export default function SearchView({ venueSongMap, favoriteIds, actionFor, recentKey, suggestedArtists, suggestedSongs, onOpen, onToggleFavorite, onAdd, onRequest, onSuggest, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [artistFilter, setArtistFilter] = useState<{ key: string; name: string } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
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

  const persistRecent = (items: string[]) => {
    setRecent(items);
    try {
      localStorage.setItem(recentKey, JSON.stringify(items));
    } catch {
      // storage dolu/kapalı — sessizce geç
    }
  };

  const saveRecent = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const key = trimmed.toLocaleLowerCase("tr");
    persistRecent([trimmed, ...recent.filter((r) => r.toLocaleLowerCase("tr") !== key)].slice(0, MAX_RECENT));
  };

  const removeRecent = (term: string) => {
    persistRecent(recent.filter((r) => r !== term));
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setArtistFilter(null);
    setSuggestOpen(false);
  };

  const submitQuery = (term: string) => {
    setQuery(term);
    setArtistFilter(null);
    setSuggestOpen(false);
    saveRecent(term);
  };

  const selectArtist = (artist: SearchArtist) => {
    setArtistFilter({ key: artist.key, name: artist.name });
    saveRecent(artist.name);
  };

  const clearArtist = () => setArtistFilter(null);

  // Sonuçlar yazarken bloklamasın diye ertelenmiş değer üzerinden hesaplanır
  const deferredQuery = useDeferredValue(query);

  // Mekan listesindeki eşleşmeler — tek veri kaynağı bu (ağ isteği yok)
  const results = useMemo<DisplaySong[]>(() => {
    const q = deferredQuery.trim().toLocaleLowerCase("tr");
    if (!q) return [];
    const matches: VenueSong[] = [];
    for (const s of venueSongMap.values()) {
      if (!s.in_venue_list) continue;
      if (s.title.toLocaleLowerCase("tr").includes(q) || s.artist.toLocaleLowerCase("tr").includes(q)) {
        matches.push(s);
      }
    }
    return matches.sort((a, b) => b.play_count - a.play_count).slice(0, 50);
  }, [deferredQuery, venueSongMap]);

  // Sonuçlardaki sanatçılar — tıklanınca o sanatçının tüm şarkılarına geçilir
  const searchArtists = useMemo<SearchArtist[]>(() => {
    const map = new Map<string, SearchArtist>();
    for (const s of results) {
      const name = primaryArtist(s.artist);
      if (!name) continue;
      const key = name.toLocaleLowerCase("tr");
      const entry = map.get(key);
      if (!entry) map.set(key, { key, name, coverUrl: s.album_cover_url, songCount: 1 });
      else entry.songCount += 1;
    }
    return [...map.values()].sort((a, b) => b.songCount - a.songCount).slice(0, 10);
  }, [results]);

  // Sanatçı görünümü: o sanatçının mekan listesindeki tüm şarkıları
  const artistSongs = useMemo<DisplaySong[]>(() => {
    if (!artistFilter) return [];
    const matches: VenueSong[] = [];
    for (const s of venueSongMap.values()) {
      if (s.in_venue_list && artistKey(s.artist) === artistFilter.key) matches.push(s);
    }
    return matches.sort((a, b) => b.play_count - a.play_count);
  }, [artistFilter, venueSongMap]);

  const interact = <T,>(fn: (arg: T) => void) => (arg: T) => {
    saveRecent(query);
    fn(arg);
  };

  const hasQuery = query.trim().length > 0;
  // Sonuç bulunamadığında zaten tam ekran öneri kutusu çıkıyor — ipucu orada tekrar edilmez
  const showRequestHint = !(hasQuery && !artistFilter && results.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0a18]">
      <div className="flex items-center gap-2 px-4 pb-3 pt-12">
        <button
          onClick={artistFilter ? clearArtist : onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          aria-label={artistFilter ? t.search.exitArtistAria : t.search.closeAria}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            autoFocus
            placeholder={t.search.placeholder}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                submitQuery(query);
                inputRef.current?.blur();
              }
            }}
            className="w-full rounded-2xl border border-[#e91e8c]/40 bg-[#1a0e2a] py-3.5 pl-4 pr-10 text-sm text-white shadow-[0_0_16px_rgba(233,30,140,0.2)] outline-none placeholder:text-[#6b7280] focus:border-[#e91e8c]"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setArtistFilter(null); setSuggestOpen(false); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 flex -translate-y-1/2 p-1"
              aria-label={t.search.clearAria}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
        {/* Arama tam ekran açılıyor ve yeni gelen ilk ziyarette doğrudan buraya
            düşüyor — dil anahtarı altta kalan başlıkta erişilemez olduğu için
            burada da duruyor (üye/misafir ayrımı yok: bu satırda yer var) */}
        <LangToggle />
      </div>

      {/* Listede olmayan şarkının da çalınabildiği bilgisi arama boyunca ekranda kalır */}
      {showRequestHint && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl border border-[#fbbf24]/25 bg-[#fbbf24]/[0.07] px-3 py-2.5">
          <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3l2.2 5.6L20 10l-5.8 1.4L12 17l-2.2-5.6L4 10l5.8-1.4L12 3z" fill="#fbbf24" /></svg>
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-[#d6c9a8]">{t.search.requestHint}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        {/* Sanatçı görünümü en başta: sanatçı, arama kutusu boşken de (öneri
            şeridinden) seçilebiliyor */}
        {artistFilter ? (
          <>
            <div className="flex items-center gap-2 pt-2">
              <h2 className="min-w-0 truncate text-sm font-bold text-white">{artistFilter.name}</h2>
              <span className="shrink-0 text-xs text-[#9ca3af]">{t.search.artistSongsSuffix}</span>
              <button
                onClick={clearArtist}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10"
                aria-label={t.browse.clearArtistAria}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            {artistSongs.map((song) => (
              <SongRow
                key={song.youtube_video_id}
                song={song}
                action={actionFor(song)}
                isFav={song.id ? favoriteIds.has(song.id) : false}
                onOpen={interact(onOpen)}
                onToggleFavorite={onToggleFavorite}
                onAdd={interact(onAdd)}
                onRequest={interact(onRequest)}
              />
            ))}

            <SuggestBox
              key={artistFilter.key}
              variant="inline"
              defaultTitle=""
              defaultArtist={artistFilter.name}
              onSuggest={onSuggest}
            />
          </>
        ) : !hasQuery ? (
          /* Kutu boş: son aramalar + mekanın müşteriye açık sanatçı ve şarkıları.
             Aynı veriler gözat sayfasının şeridi/listesiyle birebir aynı — burada
             ikinci kez hesaplanmaz, hazır gelir. */
          <>
            {recent.length > 0 && (
              <>
                <div className="mb-1 flex items-center justify-between pt-2">
                  <h2 className="text-sm font-bold text-white">{t.search.recentTitle}</h2>
                  <button onClick={() => persistRecent([])} className="text-xs font-medium text-[#9ca3af]">
                    {t.search.clear}
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
                      aria-label={fmt(t.search.removeRecentAria, { term })}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ))}
              </>
            )}

            {suggestedArtists.length >= 2 && (
              <ArtistStrip artists={suggestedArtists} onSelect={selectArtist} />
            )}

            {suggestedSongs.length > 0 ? (
              <>
                <h2 className="pt-2 text-sm font-bold text-white">{t.search.venueList}</h2>
                {suggestedSongs.map((song) => (
                  <SongRow
                    key={song.youtube_video_id}
                    song={song}
                    action={actionFor(song)}
                    isFav={song.id ? favoriteIds.has(song.id) : false}
                    onOpen={onOpen}
                    onToggleFavorite={onToggleFavorite}
                    onAdd={onAdd}
                    onRequest={onRequest}
                  />
                ))}
              </>
            ) : (
              /* Mekanın müşteriye açık hiç şarkısı yok — tek kalan yol talep */
              recent.length === 0 && (
                <div className="flex flex-col items-center pt-16 text-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#3d3450" strokeWidth="2" /><path d="M20 20l-3-3" stroke="#3d3450" strokeWidth="2" strokeLinecap="round" /></svg>
                  <p className="mt-3 text-sm text-[#6b7280]">{t.search.emptyHint}</p>
                </div>
              )
            )}
          </>
        ) : results.length === 0 ? (
          /* Mekan listesinde karşılığı yok — doğrudan öneri kutusu */
          <SuggestBox variant="empty" defaultTitle={query.trim()} defaultArtist="" onSuggest={onSuggest} />
        ) : (
          <>
            {searchArtists.length > 1 && (
              <ArtistStrip artists={searchArtists} onSelect={selectArtist} />
            )}

            <h2 className="pt-2 text-sm font-bold text-white">{t.search.venueList}</h2>
            {results.map((song) => (
              <SongRow
                key={song.youtube_video_id}
                song={song}
                action={actionFor(song)}
                isFav={song.id ? favoriteIds.has(song.id) : false}
                onOpen={interact(onOpen)}
                onToggleFavorite={onToggleFavorite}
                onAdd={interact(onAdd)}
                onRequest={interact(onRequest)}
              />
            ))}

            {/* Sonuç var ama aradığı bu değilse: aynı öneri kutusu, katlanmış halde */}
            {suggestOpen ? (
              <SuggestBox variant="inline" defaultTitle={query.trim()} defaultArtist="" onSuggest={onSuggest} />
            ) : (
              <button
                onClick={() => setSuggestOpen(true)}
                className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-[#e91e8c]/30 bg-[#e91e8c]/[0.07] px-4 py-3.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{t.search.notFoundTitle}</p>
                  <p className="mt-0.5 text-xs text-[#9ca3af]">{t.search.notFoundDesc}</p>
                </div>
                <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}

            {/* YouTube API branding şartı: şarkı verilerinin kaynağı görünür olmalı */}
            <p className="pb-2 pt-4 text-center text-[11px] text-[#6b7280]">
              {t.search.youtubePrefix}{" "}
              <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="underline">
                YouTube
              </a>{" "}
              {t.search.youtubeSuffix}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Yuvarlak kapaklı sanatçı şeridi: hem arama sonuçlarının üstünde hem de kutu
// boşken gösterilen öneri listesinde aynı görünür
function ArtistStrip({ artists, onSelect }: { artists: SearchArtist[]; onSelect: (artist: SearchArtist) => void }) {
  const t = useT();
  return (
    <>
      <h2 className="pt-2 text-sm font-bold text-white">{t.search.artists}</h2>
      <div className="flex gap-4 overflow-x-auto py-3">
        {artists.map((a) => (
          <button
            key={a.key}
            onClick={() => onSelect(a)}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 transition-transform active:scale-95"
          >
            <div className="h-16 w-16 overflow-hidden rounded-full ring-1 ring-white/10">
              {a.coverUrl ? (
                <Image src={a.coverUrl} alt={a.name} width={64} height={64} sizes="64px" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#1a0e2a]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#6b7280" strokeWidth="2" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                </div>
              )}
            </div>
            <span className="w-full truncate text-center text-[11px] text-[#9ca3af]">{a.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// Öneri kutusu: "empty" tam ekran boş sonuç hali, "inline" listenin altındaki kart
function SuggestBox({
  variant,
  defaultTitle,
  defaultArtist,
  onSuggest,
}: {
  variant: "empty" | "inline";
  defaultTitle: string;
  defaultArtist: string;
  onSuggest: (title: string, artist: string) => Promise<SuggestResult>;
}) {
  const t = useT();
  const [title, setTitle] = useState(defaultTitle);
  const [artist, setArtist] = useState(defaultArtist);
  const [touchedTitle, setTouchedTitle] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Arama metni değişince kutu yeniden hazır olsun (gönderim onayı takılı kalmasın).
  // React'in "prop değişince state'i ayarla" kalıbı: effect yerine render sırasında.
  const [seed, setSeed] = useState(defaultTitle);
  if (seed !== defaultTitle) {
    setSeed(defaultTitle);
    setSent(false);
    setError("");
  }

  // Kullanıcı alana dokunmadıysa arama kutusuna yazdığı metin şarkı adı sayılır
  const titleValue = touchedTitle ? title : defaultTitle;
  const canSend = titleValue.trim().length > 0 && artist.trim().length > 0 && !sending;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError("");
    const result = await onSuggest(titleValue.trim(), artist.trim());
    setSending(false);
    if (result === "ok" || result === "duplicate") {
      setSent(true);
      return;
    }
    if (result === "auth") return; // giriş ekranına yönlendirildi
    setError(result === "limit" ? t.suggest.limitError : t.suggest.sendError);
  };

  const spacing = variant === "empty" ? "mt-8" : "mt-5";

  if (sent) {
    return (
      <div
        className={`overflow-hidden rounded-2xl border border-[#22c55e]/25 p-4 ${spacing}`}
        style={{ background: "linear-gradient(160deg, rgba(34,197,94,0.16), rgba(34,197,94,0.05) 60%, rgba(255,255,255,0.02))" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22c55e]/15 ring-1 ring-inset ring-[#22c55e]/30">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <p className="text-sm font-semibold text-white">{t.suggest.sentTitle}</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">
          {t.suggest.sentDesc}
        </p>
        {/* Onay bildirimi kaçmasın: talep zaten gitti, bu adım isteğe bağlı */}
        <NotifyOptIn />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-[#150b23]/80 px-3.5 py-3 text-sm text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-[#e91e8c]/60 focus:bg-[#1a0e2a] focus:ring-2 focus:ring-[#e91e8c]/20";

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[#e91e8c]/25 p-4 shadow-[0_10px_30px_-18px_rgba(233,30,140,0.8)] ${spacing}`}
      style={{ background: "linear-gradient(160deg, rgba(233,30,140,0.14), rgba(139,92,246,0.08) 55%, rgba(255,255,255,0.02))" }}
    >
      {variant === "empty" ? (
        <>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e91e8c]/15 ring-1 ring-inset ring-[#e91e8c]/30">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#e91e8c" strokeWidth="2" /><path d="M20 20l-3-3" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
            <p className="text-sm font-bold leading-snug text-white">{t.suggest.emptyTitle}</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">
            {t.suggest.emptyDesc}
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e91e8c]/15 ring-1 ring-inset ring-[#e91e8c]/30">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
          <p className="text-sm font-bold leading-snug text-white">{t.suggest.inlineTitle}</p>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        <input
          type="text"
          value={titleValue}
          onChange={(e) => { setTouchedTitle(true); setTitle(e.target.value); }}
          maxLength={120}
          placeholder={t.suggest.titlePlaceholder}
          className={inputClass}
        />
        <input
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          maxLength={120}
          placeholder={t.suggest.artistPlaceholder}
          className={inputClass}
        />
      </div>

      {error && <p className="mt-2.5 text-xs text-[#ef4444]">{error}</p>}

      <button
        onClick={submit}
        disabled={!canSend}
        className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-[0_8px_24px_-10px_rgba(233,30,140,0.9)] transition-all active:scale-[0.98] disabled:scale-100 disabled:opacity-30 disabled:shadow-none"
        style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
      >
        {sending ? (
          <>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {t.suggest.sending}
          </>
        ) : (
          <>
            {t.suggest.submit}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </>
        )}
      </button>

      <div className="mt-3 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-[#9ca3af] ring-1 ring-inset ring-white/10">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#9ca3af" strokeWidth="2" /><path d="M12 8v5" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16.5" r="1" fill="#9ca3af" /></svg>
          {t.suggest.freeNote}
        </span>
      </div>
    </div>
  );
}
