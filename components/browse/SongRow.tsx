"use client";

import { memo } from "react";
import Image from "next/image";
import SongActionButton from "./SongActionButton";
import { actionStatesEqual, type DisplaySong, type SongActionState } from "./browse-types";

interface Props {
  song: DisplaySong;
  action: SongActionState;
  isFav: boolean;
  showPlayCount?: boolean;
  onOpen: (song: DisplaySong) => void;
  onToggleFavorite: (song: DisplaySong) => void;
  onAdd: (song: DisplaySong) => void;
  onRequest: (song: DisplaySong) => void;
}

function SongRow({ song, action, isFav, showPlayCount = true, onOpen, onToggleFavorite, onAdd, onRequest }: Props) {
  return (
    // Ekran dışı satırlar layout/paint maliyetine girmez — büyük kataloglarda kaydırma akıcı kalır
    <div className="border-b border-white/5 [content-visibility:auto] [contain-intrinsic-size:auto_85px]">
      <div className="flex items-center gap-3 py-3.5">
        <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-3" onClick={() => onOpen(song)}>
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#1a0e2a]">
            {song.album_cover_url && (
              <Image src={song.album_cover_url} alt={song.title} width={56} height={56} sizes="56px" className="block h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{song.title}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="truncate text-xs text-[#6b7280]">{song.artist}</span>
              {showPlayCount && (song.play_count ?? 0) > 0 && (
                <>
                  <span className="text-xs text-[#6b7280]">•</span>
                  <span className="shrink-0 text-xs font-medium text-[#e91e8c]">{song.play_count}</span>
                  <svg className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                </>
              )}
            </div>
          </div>
        </div>

        {song.id && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(song); }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            aria-label={isFav ? "Favorilerden çıkar" : "Favorilere ekle"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? "#e91e8c" : "none"}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke={isFav ? "#e91e8c" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        <div className="shrink-0">
          <SongActionButton state={action} size="row" onAdd={() => onAdd(song)} onRequest={() => onRequest(song)} />
        </div>
      </div>
    </div>
  );
}

export default memo(SongRow, (prev, next) =>
  prev.song === next.song &&
  prev.isFav === next.isFav &&
  prev.showPlayCount === next.showPlayCount &&
  actionStatesEqual(prev.action, next.action) &&
  prev.onOpen === next.onOpen &&
  prev.onToggleFavorite === next.onToggleFavorite &&
  prev.onAdd === next.onAdd &&
  prev.onRequest === next.onRequest
);
