"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MiniPlayerSlot from "@/components/admin/MiniPlayerSlot";
import { formatTime, isManualRow, isMovable, useProgress, type Playback } from "./usePlayback";

// Sahnedeki şarkının çubuğu + süreleri: saniyede dört kez tazelenen tek parça.
// Ayrı bileşen olması şart — aynı dosyada kalsaydı 500 satırlık kuyruk da her
// tick'te yeniden çizilirdi (bkz. usePlayback → useProgress).
function NowPlayingProgress({ playback }: { playback: Playback }) {
  const progress = useProgress(playback.progressStore);
  const duration = playback.duration;
  const pct = Math.min((progress / duration) * 100, 100);

  return (
    <>
      <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#e91e8c" }} />
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px] text-[#6b7280] tabular-nums">
        <span>{formatTime(progress)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </>
  );
}

// Kuyruk liste sonuna kadar uzayabiliyor (tavan 500) ve her satırda kapak
// görseli, sürükleme kancaları, üç düğme var. Tamamını DOM'da tutmak kuyruk her
// değiştiğinde gözle görülür bir donma yaratıyordu; artık yalnızca ekrandaki
// pencere + tampon çiziliyor.
//
// Satır yükseklikleri eşit DEĞİL: blok başlığı taşıyan satırlar daha uzun. Bu
// yüzden sabit yükseklik yerine kümülatif ofset dizisi tutulur, pencere ikili
// aramayla bulunur — başlıklar kaydırma çubuğunu kaydırmaz.
const ROW_HEIGHT = 57;
const HEADER_HEIGHT = 30;
const OVERSCAN_PX = 400;
// Bu sayının altında pencereleme hem gereksiz hem de sürükle-bırakta risk
const VIRTUAL_THRESHOLD = 60;

function useQueueWindow(headerFlags: boolean[], enabled: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  // Yükseklikler ekrandaki gerçek satırdan okunur: yazı tipi ya da dolgu
  // değişirse sabit sayı listeyi kaydırır. Kaydırma sırasında ÖLÇÜLMEZ —
  // her karede offsetHeight okumak tarayıcıyı yeniden yerleşime zorlar.
  const [sizes, setSizes] = useState({ row: ROW_HEIGHT, header: HEADER_HEIGHT });

  const measureView = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const top = scroller.scrollTop;
    const height = scroller.clientHeight;
    setView((prev) => (prev.top === top && prev.height === height ? prev : { top, height }));
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!enabled || !scroller) return;
    measureView();
    // passive: kaydırma sırasında tarayıcı beklemesin
    scroller.addEventListener("scroll", measureView, { passive: true });
    window.addEventListener("resize", measureView);
    return () => {
      scroller.removeEventListener("scroll", measureView);
      window.removeEventListener("resize", measureView);
    };
  }, [enabled, measureView]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!enabled || !scroller) return;
    const row = scroller.querySelector<HTMLElement>("[data-queue-row]");
    const header = scroller.querySelector<HTMLElement>("[data-queue-header]");
    const next = {
      row: row?.offsetHeight || ROW_HEIGHT,
      header: header?.offsetHeight || HEADER_HEIGHT,
    };
    setSizes((prev) => (prev.row === next.row && prev.header === next.header ? prev : next));
  }, [enabled, headerFlags, view.height]);

  // offsets[i] = i. satırın üst kenarı; son eleman toplam yükseklik
  const offsets = useMemo(() => {
    const all = [0];
    for (const hasHeader of headerFlags) {
      all.push(all[all.length - 1] + sizes.row + (hasHeader ? sizes.header : 0));
    }
    return all;
  }, [headerFlags, sizes]);

  const count = offsets.length - 1;
  if (!enabled || count <= 0) {
    return { scrollRef, start: 0, end: Math.max(count, 0), padTop: 0, padBottom: 0 };
  }

  const find = (y: number) => {
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const start = find(Math.max(0, view.top - OVERSCAN_PX));
  const end = Math.min(count, find(view.top + view.height + OVERSCAN_PX) + 1);

  return {
    scrollRef,
    start,
    end,
    padTop: offsets[start],
    padBottom: offsets[count] - offsets[end],
  };
}

// Kuyruk Spotify'daki gibi BLOKLARA ayrılır ve başlık yalnızca blok değişince
// çizilir. Elle sıra iki şerittir: önce tekli eklenenler, sonra sıraya eklenen
// listeler — her liste kendi başlığıyla (bkz. lib/queue-fill.ts pozisyon
// bantları).
type QueueGroup =
  | { kind: "customer" }
  | { kind: "manual-single" }
  | { kind: "manual-list"; playlistId: string }
  | { kind: "auto" };

const groupKey = (g: QueueGroup) => (g.kind === "manual-list" ? `manual-list:${g.playlistId}` : g.kind);

/** Ana ekranın sağ sütunu: şu an çalan + sıradaki şarkılar. */
export default function QueuePane({
  playback,
  onAddSong,
  contextName,
  playlistNames,
}: {
  playback: Playback;
  onAddSong: () => void;
  /** Otomatik bloğun başlığında yazan çalan liste adı */
  contextName?: string | null;
  /** playlist_id -> ad: sıraya eklenen liste bloklarının başlığı için */
  playlistNames?: Record<string, string>;
}) {
  const {
    queue, queueError, reordering, movableCount, moveWithinAuto, nudge, removeFromQueue,
    nowPlaying, isPlaying, playerOffline,
    playNow, currentIsCustomer, manualCount, clearManualQueue,
  } = playback;
  const movableIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const item of queue) if (isMovable(item)) map.set(item.id, n++);
    return map;
  }, [queue]);

  // Satır başına değişmeyen her şey (blok, başlık gösterilecek mi, kümülatif
  // yükseklik) tek geçişte hazırlanır: hem pencereleme buradan beslenir hem de
  // çizim sırasında komşu satıra bakmak gerekmez.
  const { rows, countByGroup, headerFlags } = useMemo(() => {
    const groupOf = (item: (typeof queue)[number]): QueueGroup => {
      if (item.user_id !== null) return { kind: "customer" };
      if (!isManualRow(item)) return { kind: "auto" };
      return item.source_playlist_id
        ? { kind: "manual-list", playlistId: item.source_playlist_id }
        : { kind: "manual-single" };
    };

    const counts = new Map<string, number>();
    const prepared = queue.map((item, i) => {
      const group = groupOf(item);
      const key = groupKey(group);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const showHeader = i === 0 || groupKey(groupOf(queue[i - 1])) !== key;
      return { item, group, key, showHeader };
    });

    return {
      rows: prepared,
      countByGroup: counts,
      headerFlags: prepared.map((row) => row.showHeader),
    };
  }, [queue]);

  const virtual = queue.length > VIRTUAL_THRESHOLD;
  const { scrollRef, start, end, padTop, padBottom } = useQueueWindow(headerFlags, virtual);

  const [dragId, setDragId] = useState<string | null>(null);
  const [playError, setPlayError] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const current = nowPlaying?.songs ?? null;

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
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Yalnızca "Sıraya ekle" ile eklenenleri siler: çalan listenin
                şarkıları ve müşterinin jetonla aldığı sıra olduğu gibi kalır. */}
            {manualCount > 0 && (
              <button
                onClick={() => void clearManualQueue()}
                title={`Sıraya eklenen ${manualCount} şarkı silinsin — çalan listeye ve müşteri şarkılarına dokunulmaz`}
                aria-label="Sırayı temizle"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                Sırayı temizle
              </button>
            )}
            <button
              onClick={onAddSong}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Ekle
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-[#6b7280] text-[10px] mt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "#e91e8c" }} /> Öncelikli
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "#8b5cf6" }} /> Jeton
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "#22c55e" }} /> Sıraya eklenen
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
        {playError && (
          <button
            onClick={() => setPlayError("")}
            className="w-full text-left text-[11px] rounded-lg px-2.5 py-2 mt-2"
            style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}
          >
            {playError}
          </button>
        )}
      </div>

      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-white/10">
        <p className="text-[10px] font-bold tracking-[0.14em] text-[#6b7280]">ŞU AN ÇALIYOR</p>
        {current ? (
          <>
            <div className="flex items-center gap-3 mt-2">
              {/* Video albüm kapağının yerini alır: kart zaten "şu an çalıyor"
                  diyor, panele ikinci bir kutu eklemeye gerek yok. Yuva boş
                  durur, videoyu kabuktaki MiniPlayer hizalar. */}
              <MiniPlayerSlot />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{current.title}</p>
                <p className="text-[#6b7280] text-[11px] truncate">{current.artist}</p>
              </div>
              {!playerOffline && isPlaying && (
                <span className="flex items-end gap-[2px] h-4 shrink-0" title="Çalıyor">
                  <span className="w-[3px] rounded-sm animate-pulse" style={{ height: "60%", background: "#e91e8c" }} />
                  <span className="w-[3px] rounded-sm animate-pulse" style={{ height: "100%", background: "#e91e8c", animationDelay: "150ms" }} />
                  <span className="w-[3px] rounded-sm animate-pulse" style={{ height: "40%", background: "#e91e8c", animationDelay: "300ms" }} />
                </span>
              )}
            </div>
            {playerOffline ? (
              <p className="mt-2 text-[11px]" style={{ color: "#fbbf24" }}>Player kapalı — süreler gizlendi</p>
            ) : (
              <NowPlayingProgress playback={playback} />
            )}
          </>
        ) : (
          <div className="flex items-center gap-3 mt-2">
            <MiniPlayerSlot />
            <p className="text-[#6b7280] text-xs">Şu an bir şarkı çalmıyor</p>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#6b7280] text-sm">
            Kuyruk boş — sıra boşaldıkça aktif listelerden otomatik doldurulur
          </div>
        ) : (
          <>
          {padTop > 0 && <div style={{ height: padTop }} />}
          {rows.slice(start, end).map(({ item, group, key, showHeader }, offset) => {
            const i = start + offset;
            const movable = isMovable(item);
            // Kuyruk liste sonuna kadar uzayabiliyor: sıra numarası satır başına
            // yeniden taranırsa (filter+findIndex) 500 satırda kare karmaşıklık
            // olur. Tek geçişte hazırlanan haritadan okunur.
            const movableIndex = movable ? movableIndexById.get(item.id) ?? -1 : -1;
            const isAdminAdded = isManualRow(item);
            // Jetonla eklenenler renkle ayrışsın: öncelikli = pembe, normal = mor,
            // elle sıraya eklenen = yeşil (rayla aynı renk), otomatik = renksiz.
            const accent = item.tokens_spent > 0 ? (item.priority ? "#e91e8c" : "#8b5cf6") : null;
            const accentBg =
              item.tokens_spent > 0 ? (item.priority ? "rgba(233,30,140,0.08)" : "rgba(139,92,246,0.08)") : undefined;
            const stripe = accent ?? (isAdminAdded ? "#22c55e" : null);

            const groupCount = countByGroup.get(key) ?? 0;
            const listName = group.kind === "manual-list" ? playlistNames?.[group.playlistId] : null;
            const headerLabel =
              group.kind === "customer"
                ? "MÜŞTERİ İSTEKLERİ"
                : group.kind === "manual-single"
                  ? "SIRAYA EKLENEN ŞARKILAR"
                  : group.kind === "manual-list"
                    ? `SIRAYA EKLENEN LİSTE${listName ? ` · ${listName.toLocaleUpperCase("tr")}` : ""}`
                    : `ÇALAN LİSTEDEN${contextName ? ` · ${contextName.toLocaleUpperCase("tr")}` : ""}`;

            return (
              <div key={item.id}>
                {showHeader && (
                  <div
                    data-queue-header
                    className="flex items-center gap-2 px-3 pt-3 pb-1.5"
                    style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.08)" : undefined }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-sm shrink-0"
                      style={{
                        background:
                          group.kind === "customer"
                            ? "#8b5cf6"
                            : group.kind === "auto"
                              ? "rgba(255,255,255,0.2)"
                              : "#22c55e",
                      }}
                    />
                    <p className="text-[10px] font-bold tracking-[0.14em] text-[#6b7280] truncate">
                      {headerLabel}
                    </p>
                    <span className="text-[10px] text-[#4b5563] shrink-0 ml-auto tabular-nums">{groupCount}</span>
                  </div>
                )}
              <div
                data-queue-row
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
                className="group flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
                style={{
                  borderTop: showHeader ? undefined : "1px solid rgba(255,255,255,0.06)",
                  borderLeft: stripe ? `3px solid ${stripe}` : "3px solid transparent",
                  background: accentBg ?? (isAdminAdded ? "rgba(34,197,94,0.05)" : undefined),
                  opacity: dragId === item.id ? 0.4 : 1,
                  cursor: movable && !reordering ? "grab" : "default",
                }}
              >
                <span className="text-[#6b7280] text-[11px] w-4 shrink-0 tabular-nums">{i + 1}</span>

                {/* Kapak + üstünde "şimdi çal": düğme yalnızca satırın üstüne
                    gelince (dokunmatikte hep) görünür, satır sadeleşir.
                    Bu satır sahneye çıkar, çalan şarkı yarıda kesilir.
                    Sahnedeki şarkı müşteriye aitse düğme kapalı. */}
                <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-white/10">
                  {item.songs.album_cover_url && (
                    <Image src={item.songs.album_cover_url} alt="" width={36} height={36} className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={async () => {
                      setPlayError("");
                      setPlayingId(item.id);
                      const res = await playNow({ queue_id: item.id }, item.songs);
                      setPlayingId(null);
                      if (!res.ok) setPlayError(res.error);
                    }}
                    disabled={currentIsCustomer || playingId !== null}
                    className={
                      currentIsCustomer || playingId !== null
                        ? // Kapalıyken hiç görünmesin: kapak da örtülmemiş olur
                          "hidden"
                        : "absolute inset-0 flex items-center justify-center transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    }
                    style={{ background: "rgba(0,0,0,0.55)" }}
                    title={
                      currentIsCustomer
                        ? "Müşterinin eklediği şarkı çalıyor — yarıda kesilemez"
                        : "Şimdi çal — çalan şarkı kesilir"
                    }
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#22c55e">
                      <path d="M8 5.5v13l11-6.5L8 5.5z" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-[13px] font-medium truncate">{item.songs.title}</p>
                  <p className="text-[#6b7280] text-[11px] truncate">
                    {item.songs.artist} ·{" "}
                    {movable ? (
                      isAdminAdded ? (
                        "sıraya eklendi"
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
              </div>
            );
          })}
          {padBottom > 0 && <div style={{ height: padBottom }} />}
          </>
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
