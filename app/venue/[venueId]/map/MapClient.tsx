"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ProfileChip from "@/components/ui/ProfileChip";
import ScanQrButton from "@/components/native/ScanQrButton";
import { useCanScanQr } from "@/lib/native-app";
import { useT } from "@/lib/i18n";
import type { MapVenue, VenueMapCard } from "@/lib/venue-map";
import VenueSheet from "./VenueSheet";

// maplibre yalnız tarayıcıda çalışır (WebGL) ve ağır: ayrı parça olarak yüklenir
const VenueMap = dynamic(() => import("./VenueMap"), { ssr: false });

interface Props {
  venueId: string;
  venues: MapVenue[];
}

/** Aynı mekanın kartı bu süre içinde yeniden açılırsa ağa gidilmez */
const CARD_FRESH_MS = 20_000;
// Sekmeler arası gidip gelince de kart önbelleği kalsın (sayfa ömrü boyunca)
const cardCache = new Map<string, { card: VenueMapCard; at: number }>();

export default function MapClient({ venueId, venues }: Props) {
  const t = useT();
  const canScan = useCanScanQr();
  const [selected, setSelected] = useState<string | null>(null);
  const [card, setCard] = useState<VenueMapCard | null>(null);
  const [cardError, setCardError] = useState(false);
  const [inset, setInset] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Seçim değişince kart: önbellekte tazesi varsa hemen, yoksa iskelet + istek
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (selected !== loadedFor) {
    setLoadedFor(selected);
    setCardError(false);
    setCard((selected && cardCache.get(selected)?.card) || null);
  }

  useEffect(() => {
    if (!selected) return;
    const hit = cardCache.get(selected);
    if (hit && Date.now() - hit.at < CARD_FRESH_MS) return;

    const abort = new AbortController();
    fetch(`/api/venue-map/${encodeURIComponent(selected)}`, { signal: abort.signal })
      .then((r) => (r.ok ? (r.json() as Promise<VenueMapCard>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        cardCache.set(selected, { card: data, at: Date.now() });
        setCard(data);
      })
      .catch(() => {
        if (!abort.signal.aborted && !hit) setCardError(true);
      });
    return () => abort.abort();
  }, [selected, reloadKey]);

  const close = useCallback(() => setSelected(null), []);
  const retry = useCallback(() => {
    setCardError(false);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 z-0 overflow-hidden"
      style={{
        bottom: "calc(4rem + var(--pmj-request-bar, 0px))",
        background: "radial-gradient(120% 80% at 50% 40%, var(--pmj-glow) 0%, var(--pmj-bg) 70%)",
      }}
    >
      <VenueMap
        venues={venues}
        currentSlug={venueId}
        selectedSlug={selected}
        bottomInset={inset}
        onSelect={setSelected}
        onReady={() => setMapReady(true)}
      />

      {/* Başlık haritanın üstünde yüzer */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pb-8 pt-12"
        style={{ background: "linear-gradient(180deg, rgb(var(--pmj-bg-rgb) / 0.92) 0%, rgb(var(--pmj-bg-rgb) / 0) 100%)" }}
      >
        <div>
          <h1 className="text-xl font-bold text-ink">{t.venueMap.title}</h1>
          <p className="text-xs text-muted">{t.venueMap.subtitle}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Başka mekana karekodla geç: uygulamada eklenti, tarayıcıda/PWA'da kamera */}
          {canScan && (
            <ScanQrButton
              className="flex h-9 items-center gap-1.5 rounded-full bg-[#e91e8c] px-3 text-xs font-bold text-white active:scale-95 disabled:opacity-70"
            />
          )}
          <ProfileChip venueId={venueId} />
        </div>
      </div>

      {venues.length > 1 && <VenueSearch venues={venues} currentSlug={venueId} onSelect={setSelected} />}

      {!mapReady && venues.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <span className="on-media rounded-full bg-black/40 px-4 py-2 text-xs text-muted">{t.venueMap.loading}</span>
        </div>
      )}

      {venues.length === 0 && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center px-8 text-center">
          <p className="rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-4 text-sm text-muted">
            {t.venueMap.empty}
          </p>
        </div>
      )}

      <VenueSheet
        slug={selected}
        card={card}
        error={cardError}
        isCurrent={selected === venueId}
        onClose={close}
        onRetry={retry}
        onInsetChange={setInset}
      />
    </div>
  );
}

/** Büyük/küçük harf ve Türkçe aksan farkını yok sayan arama anahtarı */
function searchKey(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Harita başlığının altında mekan arama; sonuca dokununca iğne seçilir ve kart açılır */
function VenueSearch({
  venues,
  currentSlug,
  onSelect,
}: {
  venues: MapVenue[];
  currentSlug: string;
  onSelect: (slug: string) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const indexed = useMemo(
    () => venues.map((v) => ({ venue: v, key: searchKey(`${v.name} ${v.tagline ?? ""}`) })),
    [venues],
  );
  const q = searchKey(query.trim());
  const results = q
    ? indexed
        .filter((x) => x.key.includes(q))
        // Adı aramayla başlayanlar öne
        .sort((a, b) => Number(!searchKey(a.venue.name).startsWith(q)) - Number(!searchKey(b.venue.name).startsWith(q)))
        .slice(0, 8)
        .map((x) => x.venue)
    : [];

  const pick = (slug: string) => {
    onSelect(slug);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="absolute inset-x-4 top-[6.25rem] z-20">
      <div className="flex h-11 items-center gap-2 rounded-full border border-ink/10 bg-canvas/90 px-4 shadow-lg backdrop-blur">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          placeholder={t.venueMap.searchPlaceholder}
          aria-label={t.venueMap.searchPlaceholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) pick(results[0].slug);
            if (e.key === "Escape") {
              setQuery("");
              inputRef.current?.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label={t.venueMap.searchClear}
            // Odak inputta kalsın diye mousedown'da önlenir
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/10 text-xs text-muted"
          >
            ✕
          </button>
        )}
      </div>

      {open && q && (
        <ul className="mt-2 max-h-[50vh] overflow-y-auto rounded-2xl border border-ink/10 bg-canvas/95 py-1 shadow-xl backdrop-blur">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">{t.venueMap.searchEmpty}</li>
          ) : (
            results.map((v) => (
              <li key={v.slug}>
                <button
                  type="button"
                  // Blur sonucu listeyi kapatmadan önce seçim yapılsın
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(v.slug)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-ink/5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#e91e8c] bg-surface text-xs font-bold text-ink">
                    {v.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      v.name.slice(0, 1).toLocaleUpperCase("tr")
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{v.name}</span>
                    {v.tagline && <span className="block truncate text-xs text-muted">{v.tagline}</span>}
                  </span>
                  {v.slug === currentSlug && (
                    <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                      {t.venueMap.youAreHere}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
