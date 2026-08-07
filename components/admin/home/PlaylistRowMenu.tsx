"use client";

import { useEffect, useRef, useState } from "react";
import type { Library, Playlist } from "./useLibrary";

const MENU_WIDTH = 240;
// Aşağı mı yukarı mı açılacağına karar vermek için kabaca menü yüksekliği
const MENU_HEIGHT = 300;

/**
 * Playlist satırındaki "⋮" menüsü: çalma sırasını değiştirme, aktif/pasif
 * yapma, yeniden adlandırma ve silme tek yerde. Şarkı satırındaki menüyle
 * aynı davranış — `position: fixed`, ray kaydırılınca kapanır.
 */
export default function PlaylistRowMenu({
  playlist,
  lib,
  /** Ray kaydırılabilir sırada mı — arama açıkken sıra değiştirilemez. */
  orderable,
  onRename,
}: {
  playlist: Playlist;
  lib: Library;
  orderable: boolean;
  onRename: () => void;
}) {
  const { playlists, moveListTo, toggleActive, deleteList, reordering, setSelectedId } = lib;

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const up = rect.bottom + MENU_HEIGHT > window.innerHeight;
      setPos({
        top: up ? rect.top - 6 : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
        up,
      });
    }
    setOpen(true);
  };

  // Sıra hesapları listenin tamamı üzerinden yapılır: menüdeki "en üste/en alta"
  // aramayla süzülmüş görünüme değil, gerçek çalma sırasına göre çalışır.
  const ordered = [...playlists].sort((a, b) => a.sort_order - b.sort_order);
  const index = ordered.findIndex((p) => p.id === playlist.id);
  const first = index <= 0;
  const last = index === ordered.length - 1;

  const move = (to: number) => {
    void moveListTo(playlist, to);
    setOpen(false);
  };

  const itemClass =
    "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.06] disabled:opacity-40";

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        aria-label="Liste işlemleri"
        title="Liste işlemleri"
        className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-colors hover:bg-white/10"
        style={{ background: open ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#9ca3af">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 rounded-xl border border-white/10 overflow-hidden shadow-2xl"
            style={{
              top: pos.top,
              left: pos.left,
              width: MENU_WIDTH,
              background: "#1a1025",
              transform: pos.up ? "translateY(-100%)" : undefined,
            }}
          >
            <div className="px-3 py-2 border-b border-white/10">
              <p className="text-white text-xs font-semibold truncate">{playlist.name}</p>
              <p className="text-[#6b7280] text-[11px]">
                Çalma sırası: {index + 1}/{ordered.length}
              </p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-1">
              {orderable ? (
                <>
                  <button onClick={() => move(index - 1)} disabled={first || reordering} className={itemClass} style={{ color: "#e5e7eb" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Yukarı taşı
                  </button>
                  <button onClick={() => move(index + 1)} disabled={last || reordering} className={itemClass} style={{ color: "#e5e7eb" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Aşağı taşı
                  </button>
                  <button onClick={() => move(0)} disabled={first || reordering} className={itemClass} style={{ color: "#e5e7eb" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4h16M6 14l6-6 6 6M12 8v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    En üste taşı
                  </button>
                  <button onClick={() => move(ordered.length - 1)} disabled={last || reordering} className={itemClass} style={{ color: "#e5e7eb" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20h16M6 10l6 6 6-6M12 16V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    En alta taşı
                  </button>
                </>
              ) : (
                <p className="px-3 py-2 text-[11px] text-[#6b7280]">
                  Sırayı değiştirmek için liste aramasını temizleyin.
                </p>
              )}

              <div className="my-1 h-px bg-white/10" />

              <button
                onClick={() => {
                  void toggleActive(playlist);
                  setOpen(false);
                }}
                className={itemClass}
                style={{ color: playlist.is_active ? "#9ca3af" : "#22c55e" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 ml-[6px] mr-[6px]"
                  style={{ background: playlist.is_active ? "rgba(255,255,255,0.25)" : "#22c55e" }}
                />
                {playlist.is_active ? "Pasife al" : "Aktif et"}
              </button>

              <button
                onClick={() => {
                  // Yeniden adlandırma kipi seçili listeyi düzenler; önce seç.
                  setSelectedId(playlist.id);
                  onRename();
                  setOpen(false);
                }}
                className={itemClass}
                style={{ color: "#e5e7eb" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Yeniden adlandır
              </button>

              <button
                onClick={() => {
                  void deleteList(playlist);
                  setOpen(false);
                }}
                className={itemClass}
                style={{ color: "#f87171" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                Listeyi sil
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
