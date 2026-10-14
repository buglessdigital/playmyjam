"use client";

import { useCallback, useEffect, useState } from "react";
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
