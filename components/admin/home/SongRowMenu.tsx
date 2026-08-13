"use client";

import { useEffect, useRef, useState } from "react";
import { ALL, type Library, type Song } from "./useLibrary";
import type { Playback } from "./usePlayback";

const MENU_WIDTH = 260;
// Aşağı mı yukarı mı açılacağına karar vermek için kabaca menü yüksekliği
const MENU_HEIGHT = 300;

/**
 * Şarkı satırındaki "⋮" menüsü: sıraya alma, görünürlük, listeye ekleme ve
 * kaldırma tek yerde. Menü `position: fixed` — satır listesi kaydırılırken
 * kırpılmasın diye.
 */
export default function SongRowMenu({
  song,
  lib,
  playback,
}: {
  song: Song;
  lib: Library;
  playback: Playback;
}) {
  const { playlists, memberships, viewId, selectedList, currentList, toggleInList, removeSongFrom, addSongToPlaylist } = lib;

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const [showLists, setShowLists] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Sayfa kaydırılınca menü satırdan kopmasın: kapat.
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
    setShowLists(false);
    setError("");
    setOpen(true);
  };

  const run = async (key: string, action: () => Promise<{ ok: boolean; error?: string } | void>) => {
    setBusy(key);
    setError("");
    const res = await action();
    setBusy(null);
    if (res && !res.ok) {
      if (res.error) setError(res.error);
      return;
    }
    setOpen(false);
  };

  const memberOf = memberships[song.id] ?? [];
  // Şarkının zaten kuyrukta olması engel değil: mekan bilerek tekrar sıraya
  // alabilir. Rozet yalnızca bilgi verir.
  const inQueue = playback.queuedVideoIds.has(song.youtube_video_id);
  // Şarkının halihazırda üyesi OLMADIĞI listeler — "başka listeye ekle" için
  const addableLists = playlists.filter((p) => !memberOf.includes(p.id));
  const removableLists = playlists.filter((p) => memberOf.includes(p.id));

  const itemClass =
    "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.06] disabled:opacity-40";

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        aria-label="Şarkı işlemleri"
        title="Şarkı işlemleri"
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
              <p className="text-white text-xs font-semibold truncate">{song.title}</p>
              <p className="text-[#6b7280] text-[11px] truncate">{song.artist}</p>
            </div>

            {error && (
              <p className="px-3 py-2 text-[11px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                {error}
              </p>
            )}

            <div className="max-h-[60vh] overflow-y-auto py-1">
              <button
                onClick={() =>
                  run("queue", () =>
                    playback.addToQueue({
                      youtube_video_id: song.youtube_video_id,
                      title: song.title,
                      artist: song.artist,
                      album_cover_url: song.album_cover_url,
                      duration_ms: song.duration_ms,
                    })
                  )
                }
                disabled={busy !== null}
                className={itemClass}
                style={{ color: "#f9a8d4" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h11M3 12h11M3 18h7M18 9v9m0 0a2 2 0 1 1-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                {busy === "queue" ? "Ekleniyor..." : "Sıraya ekle"}
                {inQueue && <span className="ml-auto text-[10px] text-[#6b7280]">zaten sırada</span>}
              </button>

              <button
                onClick={() => run("visible", async () => void (await toggleInList(song.venueSongId, song.in_venue_list)))}
                disabled={busy !== null}
                className={itemClass}
                style={{ color: song.in_venue_list ? "#9ca3af" : "#22c55e" }}
              >
                {song.in_venue_list ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.2A9.7 9.7 0 0112 5c5 0 9 4.5 10 7-.5 1.2-1.6 2.8-3.2 4.1M6.2 6.7C4.2 8.1 2.6 10.2 2 12c1 2.5 5 7 10 7 1.4 0 2.7-.3 3.9-.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    Müşteriden gizle
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>
                    Müşteriye göster
                  </>
                )}
              </button>

              <button
                onClick={() => setShowLists((v) => !v)}
                disabled={addableLists.length === 0 || busy !== null}
                className={itemClass}
                style={{ color: "#e5e7eb" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h11M3 12h8M3 18h8M17 10v8m4-4h-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                {addableLists.length === 0 ? "Tüm listelerde" : "Başka listeye ekle"}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="ml-auto"
                  style={{ transform: showLists ? "rotate(180deg)" : undefined }}
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {showLists &&
                addableLists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => run(`add-${p.id}`, () => addSongToPlaylist(song, p.id))}
                    disabled={busy !== null}
                    className={`${itemClass} pl-9`}
                    style={{ color: "#9ca3af" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: currentList?.id === p.id ? "#22c55e" : "rgba(255,255,255,0.25)" }}
                      title={currentList?.id === p.id ? "Şu an çalan liste" : "Çalmıyor"}
                    />
                    <span className="truncate">{p.name}</span>
                    {busy === `add-${p.id}` && <span className="ml-auto text-[11px]">...</span>}
                  </button>
                ))}

              <div className="my-1 h-px bg-white/10" />

              {/* Görünümdeki listeden çıkar */}
              {viewId !== ALL && selectedList && (
                <button
                  onClick={() => run("remove-current", () => removeSongFrom(song, selectedList.id))}
                  disabled={busy !== null}
                  className={itemClass}
                  style={{ color: "#e5e7eb" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h11M3 12h8M3 18h8M15 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  <span className="truncate">&quot;{selectedList.name}&quot; listesinden çıkar</span>
                </button>
              )}

              {/* "Tüm Şarkılar" görünümünde hangi listeden çıkarılacağı seçilir */}
              {viewId === ALL &&
                removableLists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => run(`rm-${p.id}`, () => removeSongFrom(song, p.id))}
                    disabled={busy !== null}
                    className={itemClass}
                    style={{ color: "#9ca3af" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h11M3 12h8M3 18h8M15 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    <span className="truncate">&quot;{p.name}&quot; listesinden çıkar</span>
                  </button>
                ))}

              <button
                onClick={() => run("remove-all", () => removeSongFrom(song, null))}
                disabled={busy !== null}
                className={itemClass}
                style={{ color: "#f87171" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                Mekandan tamamen kaldır
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
