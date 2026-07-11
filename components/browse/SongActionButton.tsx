"use client";

import type { SongActionState } from "./browse-types";

interface Props {
  state: SongActionState;
  size: "row" | "card";
  onAdd: () => void;
  onRequest: () => void;
}

export default function SongActionButton({ state, size, onAdd, onRequest }: Props) {
  if (state.kind === "cooldown") {
    if (size === "card") {
      return (
        <div className="flex h-7 items-center gap-1 rounded-full bg-black/60 px-2 backdrop-blur-sm">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#9ca3af" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
          <span className="text-[11px] font-semibold text-[#9ca3af]">{state.mins}dk</span>
        </div>
      );
    }
    return (
      <div className="flex h-8 items-center justify-center gap-[3px] rounded-[10px] border border-[#6b7280]/30 bg-[#6b7280]/10 px-2">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#6b7280" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
        <span className="text-[11px] font-semibold text-[#6b7280]">{state.mins}dk</span>
      </div>
    );
  }

  if (state.kind === "add" || state.kind === "added") {
    const added = state.kind === "added";
    if (size === "card") {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); if (!added) onAdd(); }}
          className={`flex h-8 w-8 items-center justify-center rounded-full ${added ? "bg-[#e91e8c]/30" : "neon-pink"}`}
          style={added ? undefined : { background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          aria-label={added ? "Eklendi" : "Sıraya ekle"}
        >
          {added ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
          )}
        </button>
      );
    }
    return (
      <button
        onClick={(e) => { e.stopPropagation(); if (!added) onAdd(); }}
        className={`flex h-9 w-9 items-center justify-center rounded-full border ${added ? "cursor-default border-[#e91e8c]/40 bg-[#e91e8c]/20" : "border-white/15 bg-white/10"}`}
        aria-label={added ? "Eklendi" : "Sıraya ekle"}
      >
        {added ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
        )}
      </button>
    );
  }

  const requested = state.kind === "requested";
  if (size === "card") {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); if (!requested) onRequest(); }}
        className={`flex h-8 w-8 items-center justify-center rounded-full border ${requested ? "cursor-default border-[#fbbf24]/30 bg-[#fbbf24]/10" : "border-[#fbbf24]/40 bg-[#fbbf24]/20"}`}
        aria-label={requested ? "İstendi" : "İstek gönder"}
      >
        {requested ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" /></svg>
        )}
      </button>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!requested) onRequest(); }}
      className={`flex h-8 items-center justify-center gap-1 rounded-[10px] border px-2.5 ${requested ? "cursor-default border-[#fbbf24]/30 bg-[#fbbf24]/5" : "border-[#fbbf24]/40 bg-[#fbbf24]/10"}`}
    >
      {requested ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" /></svg>
      )}
      <span className="text-[11px] font-semibold text-[#fbbf24]">{requested ? "İstendi" : "İstek"}</span>
    </button>
  );
}
