"use client";

import type { SongActionState } from "./browse-types";
import { fmt, useT } from "@/lib/i18n";

interface Props {
  state: SongActionState;
  size: "row" | "card";
  onAdd: () => void;
  onRequest: () => void;
}

export default function SongActionButton({ state, size, onAdd, onRequest }: Props) {
  const t = useT();

  // Sahnedeki şarkı: süre değil "çalıyor" gösterilir — bitince tekrar eklenebilir
  // (auto çalmalarda hemen, müşteri isteğiyle çalanlarda başlangıçtan 30 dk sonra)
  if (state.kind === "playing") {
    const eq = (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M4 14v-4M9 19V5M14 17V7M19 13v-2" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
    if (size === "card") {
      return (
        <div className="flex h-7 items-center gap-1 rounded-full bg-black/60 px-2 backdrop-blur-sm">
          {eq}
          <span className="text-[11px] font-semibold text-[#e91e8c]">{t.songAction.playing}</span>
        </div>
      );
    }
    return (
      <div className="flex h-8 items-center justify-center gap-[3px] rounded-[10px] border border-[#e91e8c]/30 bg-[#e91e8c]/10 px-2">
        {eq}
        <span className="text-[11px] font-semibold text-[#e91e8c]">{t.songAction.playing}</span>
      </div>
    );
  }

  // Oynatıcı kapalı: ekleme butonu yerine sessiz bir rozet — dokunulacak bir şey yok
  if (state.kind === "offline") {
    const icon = (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v9" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M6.5 6.5a8 8 0 1011 0" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
    if (size === "card") {
      return (
        <div className="flex h-7 items-center gap-1 rounded-full bg-black/60 px-2 backdrop-blur-sm" title={t.playerOffline.title}>
          {icon}
          <span className="text-[11px] font-semibold" style={{ color: "#fbbf24" }}>{t.playerOffline.short}</span>
        </div>
      );
    }
    return (
      <div
        className="flex h-8 items-center justify-center gap-[3px] rounded-[10px] px-2"
        style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}
        title={t.playerOffline.title}
      >
        {icon}
        <span className="text-[11px] font-semibold" style={{ color: "#fbbf24" }}>{t.playerOffline.short}</span>
      </div>
    );
  }

  if (state.kind === "cooldown") {
    if (size === "card") {
      return (
        <div className="flex h-7 items-center gap-1 rounded-full bg-black/60 px-2 backdrop-blur-sm">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#9ca3af" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>
          <span className="text-[11px] font-semibold text-[#9ca3af]">{fmt(t.songAction.cooldownMins, { n: state.mins })}</span>
        </div>
      );
    }
    return (
      <div className="flex h-8 items-center justify-center gap-[3px] rounded-[10px] border border-[#6b7280]/30 bg-[#6b7280]/10 px-2">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#6b7280" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
        <span className="text-[11px] font-semibold text-[#6b7280]">{fmt(t.songAction.cooldownMins, { n: state.mins })}</span>
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
          aria-label={added ? t.songAction.added : t.songAction.addToQueue}
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
        aria-label={added ? t.songAction.added : t.songAction.addToQueue}
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
        aria-label={requested ? t.songAction.requested : t.songAction.sendRequest}
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
      <span className="text-[11px] font-semibold text-[#fbbf24]">{requested ? t.songAction.requested : t.songAction.request}</span>
    </button>
  );
}
