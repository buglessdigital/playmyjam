"use client";

import Image from "next/image";
import { useState } from "react";
import { isMovable, type Playback } from "./usePlayback";

// Sağ sütunda sıradaki bu kadar şarkı gösterilir; gerisi "+N şarkı daha" olarak özetlenir
const VISIBLE_COUNT = 10;

/** Ana ekranın sağ sütunu: sıradaki şarkılar. */
export default function QueuePane({ playback, onAddSong }: { playback: Playback; onAddSong: () => void }) {
  const { queue, queueError, reordering, movableCount, moveWithinAuto, nudge, removeFromQueue } = playback;
  const [dragId, setDragId] = useState<string | null>(null);

  const shown = queue.slice(0, VISIBLE_COUNT);
  const rest = queue.length - shown.length;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white font-bold text-base">Sırada</p>
            <p className="text-[#6b7280] text-xs mt-0.5">
              {queue.length} şarkı · {movableCount} tanesi taşınabilir
            </p>
          </div>
          <button
            onClick={onAddSong}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0"
            style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Ekle
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-[#6b7280] text-[10px] mt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "#e91e8c" }} /> Öncelikli
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "#8b5cf6" }} /> Jeton
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "rgba(255,255,255,0.15)" }} /> Otomatik
          </span>
        </div>

        {queueError && (
          <p className="text-[11px] rounded-lg px-2.5 py-2 mt-2" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>
            {queueError}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#6b7280] text-sm">
            Kuyruk boş — sıra boşaldıkça aktif listelerden otomatik doldurulur
          </div>
        ) : (
          shown.map((item, i) => {
            const movable = isMovable(item);
            const movableIndex = movable ? queue.filter(isMovable).findIndex((q) => q.id === item.id) : -1;
            const isAdminAdded = movable && item.added_by === "admin";
            // Jetonla eklenenler renkle ayrışsın: öncelikli = pembe, normal = mor,
            // otomatik/mekan = renksiz.
            const accent = item.tokens_spent > 0 ? (item.priority ? "#e91e8c" : "#8b5cf6") : null;
            const accentBg =
              item.tokens_spent > 0 ? (item.priority ? "rgba(233,30,140,0.08)" : "rgba(139,92,246,0.08)") : undefined;

            return (
              <div
                key={item.id}
                draggable={movable && !reordering}
                onDragStart={() => movable && setDragId(item.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => {
                  // Müşteri satırlarının üstüne bırakmaya izin verme
                  if (movable && dragId && dragId !== item.id) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (movable && dragId) moveWithinAuto(dragId, item.id);
                  setDragId(null);
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
                style={{
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  borderLeft: accent ? `3px solid ${accent}` : "3px solid transparent",
                  background: accentBg,
                  opacity: dragId === item.id ? 0.4 : 1,
                  cursor: movable && !reordering ? "grab" : "default",
                }}
              >
                <span className="text-[#6b7280] text-[11px] w-4 shrink-0 tabular-nums">{i + 1}</span>

                {item.songs.album_cover_url ? (
                  <Image src={item.songs.album_cover_url} alt="" width={36} height={36} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-white/10 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-white text-[13px] font-medium truncate">{item.songs.title}</p>
                  <p className="text-[#6b7280] text-[11px] truncate">
                    {item.songs.artist} ·{" "}
                    {movable ? (
                      isAdminAdded ? (
                        "mekan ekledi"
                      ) : (
                        "otomatik"
                      )
                    ) : (
                      <>
                        {item.added_by} ·{" "}
                        <span style={{ color: accent ?? undefined, fontWeight: 600 }}>{item.tokens_spent} jeton</span>
                      </>
                    )}
                  </p>
                </div>

                {movable ? (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => nudge(item.id, -1)}
                      disabled={reordering || movableIndex <= 0}
                      title="Yukarı taşı"
                      className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button
                      onClick={() => nudge(item.id, 1)}
                      disabled={reordering || movableIndex < 0 || movableIndex >= movableCount - 1}
                      title="Aşağı taşı"
                      className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                ) : (
                  <span className="text-[#6b7280] shrink-0" title="Jetonla alınan sıra — taşınamaz">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </span>
                )}

                <button
                  onClick={() => removeFromQueue(item.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-all hover:bg-red-500/20"
                  style={{ background: "rgba(239,68,68,0.1)" }}
                  title="Kuyruktan çıkar"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            );
          })
        )}

        {rest > 0 && (
          <p className="px-4 py-3 text-[#6b7280] text-xs border-t border-white/10">
            +{rest} şarkı daha sırada
          </p>
        )}
      </div>

      {movableCount > 0 && (
        <p className="shrink-0 px-4 py-2.5 border-t border-white/10 text-[#4b5563] text-[11px] leading-relaxed">
          Yalnızca otomatik ve mekanın eklediği şarkılar taşınabilir. Müşterilerin jetonla aldığı sıra değiştirilemez.
        </p>
      )}
    </div>
  );
}
