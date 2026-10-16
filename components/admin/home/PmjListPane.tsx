"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchesTokens, searchTokens, songHaystack } from "@/lib/search-match";
import type { VenuePmjSong, VenuePmjView } from "@/lib/pmj-playlists";
import ListCover from "./ListCover";
import { cachedPmjView, fetchPmjView } from "./pmj-view-cache";
import { formatDur, type Library } from "./useLibrary";
import type { Playback } from "./usePlayback";

const MENU_WIDTH = 260;
const MENU_HEIGHT = 260;

function formatTotal(ms: number) {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} sa. ${minutes % 60} dk.` : `${minutes} dk.`;
}

/**
 * Orta pano — PMJ listesi görünümü (0081/0082). Mekanın kendi listelerindeki
 * gibi şarkılar görünür ama liste SALT OKUNUR: içeriği PMJ belirler, sıralama
 * ve şarkı ekleme yok. Satırdaki ⋮ menüsü: sıraya ekle, müşteriden gizle,
 * kendi listene ekle, bu listeden çıkar (yalnız bu mekan için; PMJ listeyi
 * güncellese de geri gelmez, başlıktan geri alınır).
 */
export default function PmjListPane({
  pmjId,
  name,
  reloadKey,
  lib,
  playback,
  onClose,
}: {
  pmjId: string;
  // Çubuktan bilinen ad: veri gelmeden başlık boş kalmasın
  name: string | null;
  // Çubukta liste açılıp kapanınca görünüm tazelensin
  reloadKey: number;
  lib: Library;
  playback: Playback;
  onClose: () => void;
}) {
  // Önbellekte varsa anında gösterilir, arkada tazelenir (bkz. pmj-view-cache.ts)
  const [view, setView] = useState<VenuePmjView | null>(() => cachedPmjView(pmjId));
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    fetchPmjView(pmjId)
      .then((v) => {
        if (!alive || !v) return;
        setView(v);
        setError("");
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : "Liste yüklenemedi"));
    return () => {
      alive = false;
    };
  }, [pmjId, reloadKey, tick]);

  const tokens = useMemo(() => searchTokens(query), [query]);
  const shown = useMemo(
    () => (view?.songs ?? []).filter((s) => tokens.length === 0 || matchesTokens(tokens, songHaystack(s))),
    [view, tokens]
  );
  const covers = [
    ...new Set((view?.songs ?? []).slice(0, 8).map((s) => s.album_cover_url).filter((c): c is string => !!c)),
  ].slice(0, 4);
  const total = (view?.songs ?? []).reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);

  const restore = async () => {
    const res = await fetch("/api/admin/pmj-playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pmj_playlist_id: pmjId, restore_excluded: true }),
    });
    if (!res.ok) setError("Geri alınamadı");
    reload();
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="px-5 pt-5 pb-4 flex items-end gap-4"
          style={{ background: "linear-gradient(180deg, rgba(245,158,11,0.18), rgba(245,158,11,0))" }}
        >
          {covers.length > 0 ? (
            <ListCover covers={covers} size={112} rounded="rounded-2xl" />
          ) : (
            <span
              className="w-28 h-28 rounded-2xl shrink-0 flex items-center justify-center text-2xl font-black"
              style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24" }}
            >
              PMJ
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-widest" style={{ color: "#fbbf24" }}>
              PMJ LİSTESİ
            </p>
            <h1 className="text-white text-2xl md:text-3xl font-black truncate">{view?.name ?? name ?? "…"}</h1>
            {view && (
              <p className="text-[#d1d5db] text-sm mt-1">
                {view.songs.length} şarkı · {formatTotal(total)} ·{" "}
                <span style={{ color: view.visible ? "#22c55e" : "#9ca3af" }}>
                  {view.visible ? "müşteriye açık" : "müşteriye kapalı"}
                </span>
              </p>
            )}
            <p className="text-[#9ca3af] text-xs mt-1">
              Liste PMJ tarafından güncellenir; sıralama ve şarkı ekleme yok. Açıp kapatmak için soldaki göz düğmesi.
            </p>
            {view && view.excluded > 0 && (
              <p className="text-xs mt-1 text-[#9ca3af]">
                {view.excluded} şarkıyı bu listeden çıkardınız ·{" "}
                <button onClick={restore} className="underline" style={{ color: "#fbbf24" }}>
                  geri getir
                </button>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-lg shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", color: "#d1d5db" }}
          >
            Kapat
          </button>
        </div>

        <div className="px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Listede şarkı veya sanatçı ara..."
            className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        {error && <p className="px-5 text-sm" style={{ color: "#f87171" }}>{error}</p>}
        {!view && !error && <p className="px-5 text-sm text-[#6b7280]">Yükleniyor…</p>}

        <div className="pb-6">
          {shown.map((song) => (
            <div
              key={song.id}
              className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5"
              style={{ opacity: song.in_venue_list === false ? 0.5 : 1 }}
            >
              {song.album_cover_url ? (
                <Image
                  src={song.album_cover_url}
                  alt=""
                  width={44}
                  height={44}
                  className="w-11 h-11 rounded-lg object-cover shrink-0"
                  unoptimized
                />
              ) : (
                <span className="w-11 h-11 rounded-lg shrink-0 bg-white/5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm truncate">{song.title}</p>
                <p className="text-[#6b7280] text-xs truncate">
                  {song.artist} · {formatDur(song.duration_ms ?? 0)}
                  {song.in_venue_list === false && " · müşteriden gizli"}
                </p>
              </div>
              <PmjSongMenu
                song={song}
                pmjId={pmjId}
                listName={view?.name ?? ""}
                lib={lib}
                playback={playback}
                onChanged={reload}
              />
            </div>
          ))}
          {view && shown.length === 0 && (
            <p className="px-5 py-6 text-sm text-[#6b7280]">{query ? "Eşleşen şarkı yok" : "Listede şarkı yok"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PmjSongMenu({
  song,
  pmjId,
  listName,
  lib,
  playback,
  onChanged,
}: {
  song: VenuePmjSong;
  pmjId: string;
  listName: string;
  lib: Library;
  playback: Playback;
  onChanged: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const [showLists, setShowLists] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(false);
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
    const res = await action().catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "İşlem başarısız" }));
    setBusy(null);
    if (res && !res.ok) {
      if (res.error) setError(res.error);
      return;
    }
    setOpen(false);
  };

  const post = async (body: Record<string, unknown>, url = "/api/admin/pmj-playlists", method = "POST") => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: (d.error as string) ?? "İşlem başarısız" };
  };

  const ownLists = lib.playlists;
  const itemClass =
    "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/5 disabled:opacity-40";

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label="Şarkı işlemleri"
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
              </button>

              {/* Gizle/göster yalnız liste mekanda açıkken anlamlı: katalog satırı o zaman var */}
              {song.venue_song_id && (
                <button
                  onClick={() =>
                    run("visible", async () => {
                      const res = await post(
                        { venue_song_id: song.venue_song_id, in_venue_list: !song.in_venue_list },
                        "/api/admin/playlist",
                        "PATCH"
                      );
                      if (res.ok) onChanged();
                      return res;
                    })
                  }
                  disabled={busy !== null}
                  className={itemClass}
                  style={{ color: song.in_venue_list ? "#9ca3af" : "#22c55e" }}
                >
                  {song.in_venue_list ? "Müşteriden gizle" : "Müşteriye göster"}
                </button>
              )}

              <button
                onClick={() => setShowLists((v) => !v)}
                disabled={ownLists.length === 0 || busy !== null}
                className={itemClass}
                style={{ color: "#e5e7eb" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h11M3 12h8M3 18h8M17 10v8m4-4h-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                Kendi listene ekle
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="ml-auto" style={{ transform: showLists ? "rotate(180deg)" : undefined }}>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showLists &&
                ownLists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      run(`add-${p.id}`, () =>
                        post(
                          {
                            youtube_video_id: song.youtube_video_id,
                            title: song.title,
                            artist: song.artist,
                            album_cover_url: song.album_cover_url,
                            duration_ms: song.duration_ms,
                            playlist_id: p.id,
                          },
                          "/api/admin/playlist"
                        )
                      )
                    }
                    disabled={busy !== null}
                    className={`${itemClass} pl-9`}
                    style={{ color: "#9ca3af" }}
                  >
                    <span className="truncate">{p.name}</span>
                    {busy === `add-${p.id}` && <span className="ml-auto text-[11px]">...</span>}
                  </button>
                ))}

              <div className="my-1 h-px bg-white/10" />

              <button
                onClick={() =>
                  run("exclude", async () => {
                    const res = await post({ pmj_playlist_id: pmjId, exclude_song_id: song.id });
                    if (res.ok) onChanged();
                    return res;
                  })
                }
                disabled={busy !== null}
                className={itemClass}
                style={{ color: "#f87171" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span className="truncate">&quot;{listName}&quot; listesinden çıkar</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
