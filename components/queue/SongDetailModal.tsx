"use client";

import Image from "next/image";

export interface SongDetail {
  id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  priority: boolean;
  tokens_spent: number;
  added_by: string;
  wait_minutes: number;
}

interface Props {
  song: SongDetail | null;
  onClose: () => void;
}

export default function SongDetailModal({ song, onClose }: Props) {
  if (!song) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none" />
      <div
        className="absolute inset-0"
        onClick={onClose}
        onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="relative w-full max-w-md rounded-t-3xl p-6 pb-10"
        style={{ background: "#1a0e2a", touchAction: "manipulation" }}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

        <div className="flex items-center gap-4 mb-6">
          {song.album_cover_url ? (
            <Image
              src={song.album_cover_url}
              alt={song.title}
              width={64}
              height={64}
              className="w-16 h-16 rounded-xl object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-white/10" />
          )}
          <div>
            <h3 className="text-white font-bold text-lg">{song.title}</h3>
            <p className="text-[#9ca3af] text-sm">{song.artist}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center py-3 border-b border-white/10">
            <span className="text-[#9ca3af] text-sm">Ekleyen</span>
            <span className="text-white text-sm font-medium">{song.added_by}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-white/10">
            <span className="text-[#9ca3af] text-sm">Harcanan Jeton</span>
            <span className="text-sm font-bold" style={{ color: "#e91e8c" }}>
              {song.tokens_spent} Jeton
            </span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-white/10">
            <span className="text-[#9ca3af] text-sm">Sıra Türü</span>
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{
                background: song.priority ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.08)",
                color: song.priority ? "#e91e8c" : "#9ca3af",
              }}
            >
              {song.priority ? (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" /></svg>
                  Öncelikli
                </span>
              ) : "Normal"}
            </span>
          </div>
          <div className="flex justify-between items-center py-3">
            <span className="text-[#9ca3af] text-sm">Tahmini Bekleme</span>
            <span className="text-white text-sm font-medium">{song.wait_minutes} dk</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3.5 rounded-2xl font-semibold text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
        >
          Kapat
        </button>
      </div>
    </div>
  );
}
