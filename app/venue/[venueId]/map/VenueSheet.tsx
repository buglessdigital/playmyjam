"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { fmt, useT } from "@/lib/i18n";
import { GENRE_FAMILIES, type GenreFamily } from "@/lib/genres";
import type { MapSong, VenueMapCard } from "@/lib/venue-map";

// Haritada mekana dokununca aşağıdan gelen kart. Üç durak:
//   peek  — haritanın alt yarısı; başlık, şu an çalan ve tür görünür
//   full  — yukarı kaydırınca sayfayı kaplar, içerik kendi içinde kayar
//   closed — aşağı kaydırınca ya da haritaya dokununca kapanır
// Tam ekrandayken içerik en üstteyse aşağı çekmek kartı geri indirir
// (içerik kaydırmasıyla karışmasın diye karar ilk harekette verilir).

type Snap = "closed" | "peek" | "full";

interface Props {
  slug: string | null;
  card: VenueMapCard | null;
  error: boolean;
  isCurrent: boolean;
  onClose: () => void;
  onRetry: () => void;
  /** Kartın haritadan kapladığı yükseklik (iğne kartın arkasında kalmasın) */
  onInsetChange: (px: number) => void;
}

const PEEK_RATIO = 0.52;
const PEEK_MAX = 460;
/** Bu hızın (px/ms) üstündeki fırlatma bir sonraki durağa geçer */
const FLING = 0.45;

export default function VenueSheet({ slug, card, error, isCurrent, onClose, onRetry, onInsetChange }: Props) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [snap, setSnap] = useState<Snap>("closed");
  const [drag, setDrag] = useState<number | null>(null);

  // Kartın çizildiği alanın (harita alanı) yüksekliği
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setHeight(parent.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Yeni mekan seçildi → yarım açılır; seçim kalktı → kapanır
  const [shownSlug, setShownSlug] = useState<string | null>(null);
  if (slug !== shownSlug) {
    setShownSlug(slug);
    setSnap(slug ? "peek" : "closed");
  }

  const peekH = Math.min(Math.round(height * PEEK_RATIO), PEEK_MAX);
  const offsetOf = useCallback(
    (s: Snap) => (s === "full" ? 0 : s === "peek" ? height - peekH : height),
    [height, peekH]
  );

  useEffect(() => {
    onInsetChange(snap === "peek" ? peekH : 0);
  }, [snap, peekH, onInsetChange]);

  useEffect(() => {
    if (snap !== "full" && contentRef.current) contentRef.current.scrollTop = 0;
  }, [snap]);

  // Sürükleme. Dokunmatikte yerel dinleyici: React'in touchmove'u pasif,
  // preventDefault ile sayfa kaydırmasını durduramıyor.
  const gesture = useRef<{
    startY: number;
    startOffset: number;
    mode: "pending" | "drag" | "scroll";
    fromHeader: boolean;
    samples: { y: number; t: number }[];
  } | null>(null);
  const snapRef = useRef(snap);
  const dragRef = useRef<number | null>(null);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  const setDragBoth = useCallback((value: number | null) => {
    dragRef.current = value;
    setDrag(value);
  }, []);

  const release = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    const current = dragRef.current;
    if (!g || g.mode !== "drag" || current === null) return;
    const s = g.samples;
    const a = s[Math.max(0, s.length - 5)];
    const b = s[s.length - 1];
    const v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const stops: Snap[] = ["full", "peek", "closed"];
    let next: Snap;
    if (Math.abs(v) > FLING) {
      const i = stops.indexOf(snapRef.current);
      next = stops[Math.max(0, Math.min(2, i + (v > 0 ? 1 : -1)))];
    } else {
      next = stops.reduce((best, s2) =>
        Math.abs(offsetOf(s2) - current) < Math.abs(offsetOf(best) - current) ? s2 : best
      );
    }
    dragRef.current = null;
    setDrag(null);
    setSnap(next);
    if (next === "closed") onClose();
  }, [offsetOf, onClose]);

  const begin = useCallback(
    (y: number, target: EventTarget | null) => {
      gesture.current = {
        startY: y,
        startOffset: offsetOf(snapRef.current),
        mode: "pending",
        fromHeader: !!(target instanceof Node && headerRef.current?.contains(target)),
        samples: [{ y, t: performance.now() }],
      };
    },
    [offsetOf]
  );

  // true: hareket kartı sürüklüyor (çağıran varsayılan davranışı durdurmalı)
  const move = useCallback(
    (y: number): boolean => {
      const g = gesture.current;
      if (!g) return false;
      const dy = y - g.startY;
      if (g.mode === "pending") {
        if (Math.abs(dy) < 4) return false;
        const atTop = (contentRef.current?.scrollTop ?? 0) <= 0;
        g.mode =
          snapRef.current !== "full" || g.fromHeader || (atTop && dy > 0) ? "drag" : "scroll";
      }
      if (g.mode !== "drag") return false;
      g.samples.push({ y, t: performance.now() });
      if (g.samples.length > 8) g.samples.shift();
      setDragBoth(Math.max(0, Math.min(height, g.startOffset + dy)));
      return true;
    },
    [height, setDragBoth]
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => begin(e.touches[0].clientY, e.target);
    const onMove = (e: TouchEvent) => {
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
    };
  }, [begin, move, release]);

  // Masaüstü: başlıktan fareyle sürükleme
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    begin(e.clientY, e.target);
    const onMove = (ev: MouseEvent) => {
      move(ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      release();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const offset = drag ?? offsetOf(snap);
  const full = snap === "full" && drag === null;

  if (height === 0) return <div ref={rootRef} />;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={card?.name ?? t.venueMap.title}
      aria-hidden={snap === "closed"}
      className="absolute inset-x-0 top-0 z-20 flex flex-col overflow-hidden border-t border-white/10"
      style={{
        height,
        transform: `translateY(${offset}px)`,
        transition: drag === null ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 320ms" : "none",
        borderRadius: full ? 0 : "24px 24px 0 0",
        background: "linear-gradient(180deg, #1a0e2a 0%, #0f0a18 220px)",
        boxShadow: "0 -12px 40px rgba(0,0,0,0.55)",
        visibility: snap === "closed" && drag === null ? "hidden" : "visible",
      }}
    >
      {/* Tutamak + başlık: her durumda sürüklenebilir */}
      <div
        ref={headerRef}
        onMouseDown={onMouseDown}
        className="shrink-0 cursor-grab touch-none select-none"
        // Tam ekranda iPhone çentiğinin altına insin
        style={{ paddingTop: full ? "env(safe-area-inset-top)" : 0, transition: "padding-top 320ms" }}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-white/20" />
        </div>
        <SheetHeader card={card} isCurrent={isCurrent} onClose={onClose} />
      </div>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 px-5 pb-8"
        style={{ overflowY: full ? "auto" : "hidden", overscrollBehavior: "contain" }}
      >
        {error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-[#9ca3af]">{t.venueMap.cardError}</p>
            <button
              onClick={onRetry}
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white active:scale-95"
            >
              {t.venueMap.retry}
            </button>
          </div>
        ) : card ? (
          <CardBody card={card} />
        ) : (
          <CardSkeleton />
        )}
        {!full && card && (
          <p className="pointer-events-none mt-4 text-center text-[11px] text-[#6b7280]">{t.venueMap.dragHint}</p>
        )}
      </div>
    </div>
  );
}

function SheetHeader({ card, isCurrent, onClose }: { card: VenueMapCard | null; isCurrent: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-5 pb-4 pt-1">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 text-sm font-bold text-white"
        style={{ borderColor: isCurrent ? "#fbbf24" : "#e91e8c", background: "#1a0e2a" }}
      >
        {card?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.logo_url} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          card?.name.slice(0, 1).toLocaleUpperCase("tr")
        )}
      </div>
      <div className="min-w-0 flex-1">
        {card ? (
          <>
            <h2 className="truncate text-lg font-bold leading-tight text-white">{card.name}</h2>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              {isCurrent && (
                <span className="shrink-0 rounded-full bg-[#fbbf24]/15 px-2 py-0.5 text-[10px] font-bold text-[#fbbf24]">
                  {t.venueMap.youAreHere}
                </span>
              )}
              {card.tagline && <p className="truncate text-xs text-[#9ca3af]">{card.tagline}</p>}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="h-4 w-36 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-24 animate-pulse rounded bg-white/5" />
          </div>
        )}
      </div>
      {card && (
        <a
          href={card.directions_url}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={t.venueMap.directions}
          title={t.venueMap.directions}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white active:scale-95"
          style={{ background: "#e91e8c" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 11l18-8-8 18-2-8-8-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </a>
      )}
      <button
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={t.common.close}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 active:scale-95"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function genreLabel(key: string, labels: Record<GenreFamily, string>): string {
  return (GENRE_FAMILIES as readonly string[]).includes(key)
    ? labels[key as GenreFamily]
    : key.replace(/^raw:/, "");
}

function CardBody({ card }: { card: VenueMapCard }) {
  const t = useT();
  const [topGenre, ...otherGenres] = card.genres;

  return (
    <div className="flex flex-col gap-6">
      {/* Şu an çalan */}
      {card.nowPlaying ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[#e91e8c]/25 bg-[#e91e8c]/10 p-3">
          <Cover song={card.nowPlaying} size={48} />
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#e91e8c]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e91e8c]" />
              {t.venueMap.nowPlaying}
            </p>
            <p className="truncate text-sm font-semibold text-white">{card.nowPlaying.title}</p>
            <p className="truncate text-xs text-[#9ca3af]">{card.nowPlaying.artist}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-[#9ca3af]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4b5563]" />
          {t.venueMap.notPlaying}
        </div>
      )}

      {/* En çok çalan tür */}
      <Section title={t.venueMap.topGenre} hint={fmt(t.venueMap.lastDays, { days: card.days })}>
        {topGenre ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-end justify-between gap-3">
              <span
                className="text-2xl font-extrabold leading-none"
                style={{
                  background: "linear-gradient(90deg, #ff4fb0, #e91e8c 45%, #8b5cf6)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {genreLabel(topGenre.key, t.venueMap.genres)}
              </span>
              <span className="text-sm font-bold text-white">%{Math.round(topGenre.share * 100)}</span>
            </div>
            <Bar share={topGenre.share} strong />
            {otherGenres.map((g) => (
              <div key={g.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-[#9ca3af]">
                  {genreLabel(g.key, t.venueMap.genres)}
                </span>
                <div className="flex-1">
                  <Bar share={g.share} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs text-[#9ca3af]">%{Math.round(g.share * 100)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty text={card.totalPlays > 0 ? t.venueMap.genreEmpty : t.venueMap.topSongsEmpty} />
        )}
      </Section>

      {/* En çok çalınanlar */}
      <Section title={t.venueMap.topSongs} hint={fmt(t.venueMap.lastDays, { days: card.days })}>
        {card.topSongs.length ? (
          <ol className="flex flex-col">
            {card.topSongs.map((s, i) => (
              <SongRow key={`${s.title}-${s.artist}-${i}`} index={i + 1} song={s}>
                <span className="shrink-0 text-xs font-semibold text-[#9ca3af]">
                  {fmt(t.venueMap.plays, { n: s.plays })}
                </span>
              </SongRow>
            ))}
          </ol>
        ) : (
          <Empty text={t.venueMap.topSongsEmpty} />
        )}
      </Section>

      {/* Sıradaki 10 şarkı */}
      <Section title={t.venueMap.upNext}>
        {card.upNext.length ? (
          <ol className="flex flex-col">
            {card.upNext.map((s, i) => (
              <SongRow key={`${s.title}-${s.artist}-${i}`} index={i + 1} song={s}>
                {s.priority && (
                  <span className="shrink-0 rounded-full bg-[#fbbf24]/15 px-2 py-0.5 text-[10px] font-bold text-[#fbbf24]">
                    {t.venueMap.priority}
                  </span>
                )}
              </SongRow>
            ))}
          </ol>
        ) : (
          <Empty text={t.venueMap.upNextEmpty} />
        )}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/80">{title}</h3>
        {hint && <span className="text-[11px] text-[#6b7280]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Bar({ share, strong = false }: { share: number; strong?: boolean }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-white/[0.06] ${strong ? "h-2" : "h-1.5"}`}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(4, Math.round(share * 100))}%`,
          background: strong ? "linear-gradient(90deg, #e91e8c, #8b5cf6)" : "rgba(233,30,140,0.5)",
        }}
      />
    </div>
  );
}

function SongRow({ index, song, children }: { index: number; song: MapSong; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-0">
      <span className="w-5 shrink-0 text-center text-xs font-bold text-[#6b7280]">{index}</span>
      <Cover song={song} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{song.title}</p>
        <p className="truncate text-xs text-[#9ca3af]">{song.artist}</p>
      </div>
      {children}
    </li>
  );
}

function Cover({ song, size }: { song: MapSong; size: number }) {
  return song.cover ? (
    <Image
      src={song.cover}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div className="shrink-0 rounded-lg bg-white/10" style={{ width: size, height: size }} />
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-white/[0.03] px-4 py-3 text-xs text-[#6b7280]">{text}</p>;
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-[72px] animate-pulse rounded-2xl bg-white/[0.06]" />
      <div className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-white/[0.08]" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}
