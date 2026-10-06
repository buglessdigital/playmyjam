"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadPmjMapStyle } from "@/lib/map-style";
import type { MapVenue } from "@/lib/venue-map";

// Yalnızca bu sayfada yüklenir (MapClient dinamik içe aktarır): maplibre
// ~250 KB, diğer sekmelerin paketine girmesin.

interface Props {
  venues: MapVenue[];
  currentSlug: string;
  selectedSlug: string | null;
  /** Kart açıkken iğnenin kartın arkasında kalmaması için alttan boşluk (px) */
  bottomInset: number;
  onSelect: (slug: string | null) => void;
  onReady?: () => void;
}

// Worker derleme öncesi public/'e kopyalanır (bkz. scripts/copy-maplibre-worker.mjs)
setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

// Varsayılan görünüm: mekan yokken İzmir
const FALLBACK_CENTER: [number, number] = [27.1428, 38.4237];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("tr") ?? "")
    .join("");
}

function markerElement(venue: MapVenue, isCurrent: boolean): HTMLElement {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "pmj-marker";
  if (isCurrent) root.dataset.current = "1";
  root.setAttribute("aria-label", venue.name);

  const ring = document.createElement("span");
  ring.className = "pmj-marker-ring";
  if (venue.logo_url) {
    const img = document.createElement("img");
    img.src = venue.logo_url;
    img.alt = "";
    img.draggable = false;
    img.onerror = () => {
      img.remove();
      ring.textContent = initials(venue.name);
    };
    ring.appendChild(img);
  } else {
    ring.textContent = initials(venue.name);
  }
  root.appendChild(ring);

  const label = document.createElement("span");
  label.className = "pmj-marker-label";
  label.textContent = venue.name;
  root.appendChild(label);
  return root;
}

function highlight(markers: Map<string, { el: HTMLElement }>, selectedSlug: string | null) {
  for (const [slug, { el }] of markers) {
    el.dataset.selected = slug === selectedSlug ? "1" : "";
    el.style.zIndex = slug === selectedSlug ? "3" : el.dataset.current ? "2" : "1";
  }
}

export default function VenueMap({ venues, currentSlug, selectedSlug, bottomInset, onSelect, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const markersRef = useRef(new Map<string, { marker: Marker; el: HTMLElement }>());
  // Olay işleyicileri harita bir kez kurulduğu için en güncel geri çağrıyı ref'ten okur
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onReadyRef.current = onReady;
  });

  // Harita kurulumu — mekan listesi değişmedikçe bir kez
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const abort = new AbortController();
    let map: MapLibre | null = null;
    const markers = markersRef.current;

    loadPmjMapStyle(abort.signal).then((style) => {
      if (abort.signal.aborted) return;
      map = new MapLibre({
        container,
        style,
        center: FALLBACK_CENTER,
        zoom: 11,
        attributionControl: { compact: true },
        // Telefonda iki parmakla döndürme/eğme kafa karıştırıyor; düz harita yeter
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      // Boş yere dokununca kart kapanır (iğneler kendi tıklamasını durdurur)
      map.on("click", () => onSelectRef.current(null));
      map.once("load", () => onReadyRef.current?.());

      for (const venue of venues) {
        const el = markerElement(venue, venue.slug === currentSlug);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(venue.slug);
        });
        // Koordinat halkanın ortasına düşsün (etiket altında sarkar)
        const marker = new Marker({ element: el, anchor: "top", offset: [0, -22] })
          .setLngLat([venue.lng, venue.lat])
          .addTo(map);
        markers.set(venue.slug, { marker, el });
      }

      // İlk görünüm: tüm mekanlar sığsın; tek mekan varsa ona yakın
      if (venues.length === 1) {
        map.jumpTo({ center: [venues[0].lng, venues[0].lat], zoom: 14 });
      } else if (venues.length > 1) {
        const bounds = new LngLatBounds();
        for (const v of venues) bounds.extend([v.lng, v.lat]);
        map.fitBounds(bounds, { padding: { top: 90, bottom: 60, left: 50, right: 50 }, maxZoom: 14, duration: 0 });
      }
    });

    return () => {
      abort.abort();
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, [venues, currentSlug]);

  // Seçili iğne öne çıkar ve kartın üstünde kalacak şekilde ortalanır
  useEffect(() => {
    highlight(markersRef.current, selectedSlug);
    const map = mapRef.current;
    const venue = venues.find((v) => v.slug === selectedSlug);
    if (!map || !venue) return;
    map.easeTo({
      center: [venue.lng, venue.lat],
      zoom: Math.max(map.getZoom(), 14),
      padding: { top: 0, left: 0, right: 0, bottom: bottomInset },
      duration: 450,
    });
  }, [selectedSlug, venues, bottomInset]);

  return (
    <>
      {/* maplibre kapsayıcıya position:relative veriyor — boyutu dış kutu taşır */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <style>{MARKER_CSS}</style>
    </>
  );
}

const MARKER_CSS = `
.pmj-marker {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: none; border: 0; padding: 0; cursor: pointer;
  transform-origin: 50% 0; -webkit-tap-highlight-color: transparent;
}
.pmj-marker-ring {
  width: 44px; height: 44px; border-radius: 9999px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: #1a0e2a; color: #fff; font: 700 14px/1 system-ui, sans-serif;
  border: 2.5px solid #e91e8c;
  box-shadow: 0 0 0 4px rgba(233,30,140,0.18), 0 6px 18px rgba(0,0,0,0.55);
  transition: transform .2s ease, box-shadow .2s ease;
}
.pmj-marker-ring img { width: 100%; height: 100%; object-fit: cover; }
.pmj-marker[data-current="1"] .pmj-marker-ring {
  border-color: #fbbf24; box-shadow: 0 0 0 4px rgba(251,191,36,0.2), 0 6px 18px rgba(0,0,0,0.55);
}
.pmj-marker[data-selected="1"] .pmj-marker-ring {
  transform: scale(1.18);
  box-shadow: 0 0 0 6px rgba(233,30,140,0.3), 0 0 28px rgba(233,30,140,0.55);
}
.pmj-marker-label {
  max-width: 120px; padding: 2px 8px; border-radius: 9999px;
  background: rgba(15,10,24,0.88); border: 1px solid rgba(255,255,255,0.1);
  color: #fff; font: 600 11px/1.4 system-ui, sans-serif;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.maplibregl-ctrl-attrib, .maplibregl-ctrl-attrib.maplibregl-compact {
  background: rgba(15,10,24,0.75) !important; color: #6b7280;
}
.maplibregl-ctrl-attrib a { color: #9ca3af !important; }
.maplibregl-ctrl-attrib-button { filter: invert(1) opacity(.6); }
`;
