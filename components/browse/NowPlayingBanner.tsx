"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { VenueSong } from "./browse-types";

interface Props {
  song: VenueSong;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
  onClick: () => void;
}

export default function NowPlayingBanner({ song, progressMs, durationMs, isPlaying, onClick }: Props) {
  const [progress, setProgress] = useState(progressMs);
  const [prevProgressMs, setPrevProgressMs] = useState(progressMs);

  // Realtime güncellemesi geldiğinde lokal tick'i sunucu değerine sıfırla
  if (progressMs !== prevProgressMs) {
    setPrevProgressMs(progressMs);
    setProgress(progressMs);
  }

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 1000, durationMs));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, durationMs]);

  const pct = durationMs > 0 ? Math.min((progress / durationMs) * 100, 100) : 0;

  return (
    <button
      onClick={onClick}
      className="block w-full rounded-2xl p-3 text-left"
      style={{ background: "linear-gradient(145deg, #2d1045 0%, #1a0e2a 100%)", border: "1px solid rgba(233,30,140,0.15)" }}
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#0f0a18]">
          {song.album_cover_url && (
            <Image src={song.album_cover_url} alt={song.title} width={48} height={48} sizes="48px" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isPlaying && (
              <div className="flex h-3 items-end gap-0.5">
                {[3, 5, 4, 6, 3].map((h, i) => (
                  <div key={i} className="w-[3px] rounded-full" style={{ height: `${h * 2}px`, background: "#e91e8c", animation: `eq-bar ${0.5 + i * 0.12}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#e91e8c]">Şu An Çalıyor</span>
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{song.title}</p>
          <p className="truncate text-xs text-[#9ca3af]">{song.artist}</p>
        </div>
        <svg className="shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #e91e8c, #8b5cf6)" }} />
      </div>
      <style>{`@keyframes eq-bar { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }`}</style>
    </button>
  );
}
