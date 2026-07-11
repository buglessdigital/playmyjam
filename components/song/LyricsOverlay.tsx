"use client";

import { useEffect, useRef } from "react";
import { Montserrat } from "next/font/google";
import type { LyricsResult } from "@/lib/lyrics";

// Şarkı sözleri için ayrı, kalın ve sahneye yakışan bir font — Türkçe karakterler için latin-ext şart
const lyricsFont = Montserrat({
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
});

interface Props {
  title: string;
  artist: string;
  lyrics: LyricsResult | null;
  loading: boolean;
  activeIndex: number;
  onClose: () => void;
}

export default function LyricsOverlay({ title, artist, lyrics, loading, activeIndex, onClose }: Props) {
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "linear-gradient(180deg, #2a1a30 0%, #150c1f 45%, #0f0a18 100%)" }}
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-12">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          <p className="truncate text-xs text-[#9ca3af]">{artist}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"
          aria-label="Sözleri kapat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-20 pt-4">
        {loading ? (
          <div className="flex justify-center pt-16">
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#6b7280" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
          </div>
        ) : !lyrics || lyrics.lines.length === 0 ? (
          <p className="pt-16 text-center text-sm text-[#6b7280]">Söz bulunamadı</p>
        ) : (
          <div className={`${lyricsFont.className} flex flex-col gap-4`}>
            {lyrics.lines.map((line, i) => {
              const isActive = i === activeIndex;
              const isPast = activeIndex >= 0 && i < activeIndex;
              return (
                <p
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className="m-0 transition-all duration-200"
                  style={{
                    fontSize: isActive ? 23 : 19,
                    lineHeight: 1.35,
                    fontWeight: isActive ? 800 : 700,
                    color: isActive ? "#e91e8c" : isPast ? "rgba(255,255,255,0.35)" : "white",
                    textShadow: isActive ? "0 0 24px rgba(233,30,140,0.45)" : "none",
                  }}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
