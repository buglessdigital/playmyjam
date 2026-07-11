"use client";

import { memo } from "react";
import Image from "next/image";
import SongActionButton from "./SongActionButton";
import { actionStatesEqual, type DisplaySong, type SongActionState } from "./browse-types";

interface Props {
  song: DisplaySong;
  action: SongActionState;
  onOpen: (song: DisplaySong) => void;
  onAdd: (song: DisplaySong) => void;
  onRequest: (song: DisplaySong) => void;
}

function SongCard({ song, action, onOpen, onAdd, onRequest }: Props) {
  return (
    <div className="w-[140px] shrink-0">
      <div className="relative cursor-pointer transition-transform active:scale-95" onClick={() => onOpen(song)}>
        <div className="h-[140px] w-[140px] overflow-hidden rounded-2xl bg-[#1a0e2a]">
          {song.album_cover_url && (
            <Image src={song.album_cover_url} alt={song.title} width={140} height={140} sizes="140px" className="block h-full w-full object-cover" />
          )}
        </div>
        {(song.play_count ?? 0) > 0 && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-sm">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="#e91e8c" strokeWidth="2.5" /><circle cx="18" cy="16" r="3" stroke="#e91e8c" strokeWidth="2.5" /></svg>
            <span className="text-[10px] font-bold text-white">{song.play_count}</span>
          </span>
        )}
        <div className="absolute bottom-1.5 right-1.5">
          <SongActionButton state={action} size="card" onAdd={() => onAdd(song)} onRequest={() => onRequest(song)} />
        </div>
      </div>
      <div className="cursor-pointer" onClick={() => onOpen(song)}>
        <p className="mt-2 truncate text-sm font-semibold text-white">{song.title}</p>
        <p className="truncate text-xs text-[#9ca3af]">{song.artist}</p>
      </div>
    </div>
  );
}

export default memo(SongCard, (prev, next) =>
  prev.song === next.song &&
  actionStatesEqual(prev.action, next.action) &&
  prev.onOpen === next.onOpen &&
  prev.onAdd === next.onAdd &&
  prev.onRequest === next.onRequest
);
