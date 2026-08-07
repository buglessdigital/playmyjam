"use client";

import Image from "next/image";
import { useState } from "react";
import FitTitle from "./FitTitle";
import ListCover from "./ListCover";
import SongRowMenu from "./SongRowMenu";
import { ALL, formatDur, type Library } from "./useLibrary";
import type { Playback } from "./usePlayback";

// Liste toplam süresi: "2 sa. 57 dk." biçiminde
function formatTotal(ms: number) {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} sa. ${minutes % 60} dk.` : `${minutes} dk.`;
}

/** Ana ekranın orta sütunu: seçili listenin (ya da tüm katalogun) şarkıları. */
export default function LibraryPane({
  lib,
  playback,
  onAddSong,
  onImportPlaylist,
  onRename,
}: {
  lib: Library;
  playback: Playback;
  onAddSong: () => void;
  onImportPlaylist: () => void;
  onRename: () => void;
}) {
  const {
    selectedList,
    selectedSource,
    coversByList,
    catalogCovers,
    queueLists,
    currentList,
    consumed,
    countFor,
    visibleSongs,
    loading,
    filtering,
    query,
    setQuery,
    viewId,
    memberships,
    playlists,
    orderable,
    orderError,
    savingOrder,
    moveSong,
    setQueued,
    playNow,
    setPlayOnce,
    setShuffle,
    toggleAutoSync,
    syncNow,
    syncingId,
    syncNote,
    setSyncNote,
    deleteList,
  } = lib;

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [playNote, setPlayNote] = useState("");

  const totalMs = visibleSongs.reduce((n, s) => n + (s.duration_ms || 0), 0);

  const queued = selectedList ? selectedList.queue_position !== null : false;
  const isPlaying = !!selectedList && currentList?.id === selectedList.id;
  // Kuyruk döngüsel: çalan listeden sonra sıradakiler, sonuncu bitince başa
  // dönülür. Bu yüzden "sırada kaçıncı" çalan listeden itibaren sayılır.
  const turnsAway = (() => {
    if (!selectedList || !queued || isPlaying) return 0;
    const from = queueLists.findIndex((p) => p.id === currentList?.id);
    const mine = queueLists.findIndex((p) => p.id === selectedList.id);
    if (from < 0 || mine < 0) return mine + 1;
    return ((mine - from) + queueLists.length) % queueLists.length;
  })();

  const statusLine = !selectedList
    ? "Mekanın tüm şarkıları — müşteriler hangi liste sırada olursa olsun bu havuzun tamamından seçebilir"
    : !queued
      ? "Sırada değil — şarkıları müşteri yine de seçebilir, otomatik çalmaz"
      : isPlaying
        ? `Şu an çalıyor — bu turda ${consumed[selectedList.id] ?? 0}/${countFor(selectedList.id)} şarkı çalındı`
        : `Sırada — kendinden önceki ${turnsAway === 1 ? "liste" : `${turnsAway} liste`} bitince başlar`;

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Tek kaydırma alanı: kapak yukarı kayar, araç çubuğu üstte yapışık kalır */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Kapak + başlık */}
        <div
          className="px-5 pt-6 pb-5"
          style={{
            background:
              "linear-gradient(160deg, rgba(233,30,140,0.30) 0%, rgba(88,28,135,0.22) 45%, rgba(15,10,24,0) 100%)",
          }}
        >
          <div className="flex items-end gap-6 lg:gap-9 flex-wrap">
            <div className="rounded-2xl shrink-0" style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.55)" }}>
              <ListCover
                covers={selectedList ? coversByList[selectedList.id] ?? [] : catalogCovers}
                size={176}
                rounded="rounded-2xl"
              />
            </div>

            <div className="min-w-0 flex-1 lg:pl-2">
              <p className="text-white/70 text-xs font-semibold uppercase tracking-wide">
                {selectedList ? "Mekan çalma listesi" : "Mekan katalogu"}
              </p>
              {/* Liste adı tek satır: uzadıkça sığana kadar küçülür, düzen oynamaz */}
              <h1 className="text-white font-extrabold mt-2.5 mb-3.5">
                <FitTitle text={selectedList ? selectedList.name : "Tüm Şarkılar"} />
              </h1>
              <p className="text-[#e5e7eb] text-sm font-semibold">
                {visibleSongs.length} şarkı
                {totalMs > 0 && ` · ${formatTotal(totalMs)}`}
              </p>
              <p className="text-[#9ca3af] text-[13px] mt-1.5">{statusLine}</p>
              {selectedSource && (
                <p className="text-xs mt-2 flex items-center gap-1.5 flex-wrap">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke="#FF0000" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span style={{ color: selectedSource.last_error ? "#f87171" : selectedSource.auto_sync ? "#22c55e" : "#6b7280" }}>
                    {selectedSource.last_error
                      ? `Senkron hatası: ${selectedSource.last_error}`
                      : selectedSource.auto_sync
                        ? "Her gün otomatik güncelleniyor"
                        : "Otomatik güncelleme kapalı"}
                  </span>
                  {selectedSource.last_synced_at && !selectedSource.last_error && (
                    <span className="text-[#4b5563]">
                      · Son: {new Date(selectedSource.last_synced_at).toLocaleDateString("tr-TR")}
                      {selectedSource.last_added > 0 ? ` (+${selectedSource.last_added})` : ""}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Araç çubuğu — liste kaydırılırken üstte kalır */}
        <div
          className="sticky top-0 z-10 px-4 py-3 border-b border-white/10"
          style={{ background: "rgba(17,11,27,0.92)", backdropFilter: "blur(10px)" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {selectedList && (
              <>
                {/* Play: sırayı beklemeden bu liste çalmaya başlar. Sahnedeki
                    şarkı kesilmez, müşteri istekleri etkilenmez. */}
                <button
                  onClick={async () => {
                    setPlayNote("");
                    const res = await playNow(selectedList);
                    if (!res.ok) setPlayNote(res.error);
                  }}
                  disabled={isPlaying || countFor(selectedList.id) === 0}
                  className="w-10 h-10 flex items-center justify-center rounded-full shrink-0 transition-transform hover:scale-105 disabled:hover:scale-100 disabled:opacity-45"
                  style={{ background: "#22c55e" }}
                  title={
                    isPlaying
                      ? "Bu liste zaten çalıyor"
                      : "Şimdi bu listeyi çal — sıradaki şarkıdan itibaren bu listeden gelir"
                  }
                >
                  {isPlaying ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#0b1220">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#0b1220">
                      <path d="M8 5.5v13l11-6.5L8 5.5z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => setQueued(selectedList, !queued)}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                  style={{
                    background: queued ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                    color: queued ? "#22c55e" : "#9ca3af",
                  }}
                  title={
                    queued
                      ? "Çalma sırasında — sırası gelince kendiliğinden çalar. Çıkarmak için tıklayın"
                      : "Sırada değil — müşteri yine seçebilir, otomatik çalmaz. Sıraya almak için tıklayın"
                  }
                >
                  {queued ? "Sırada" : "Sıraya Ekle"}
                </button>

                {/* Tek seferlik: liste bir turunu bitirince kuyruktan düşer.
                    Kapalıyken (varsayılan) kuyruk sonsuza dek döner. */}
                <button
                  onClick={() => setPlayOnce(selectedList, !selectedList.play_once)}
                  aria-pressed={selectedList.play_once}
                  className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                  style={{ background: selectedList.play_once ? "rgba(233,30,140,0.18)" : "rgba(255,255,255,0.08)" }}
                  title={
                    selectedList.play_once
                      ? "Tek seferlik — liste bir kez baştan sona çalınca sıradan düşer"
                      : "Tekrar açık — liste bitince sıra döner, bu liste tekrar çalar"
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"
                      stroke={selectedList.play_once ? "#f9a8d4" : "#9ca3af"}
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {selectedList.play_once && (
                      <path d="M11 9.5h1.5V15" stroke="#f9a8d4" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                </button>
                {/* Liste İÇİNDEKİ şarkıların sırası: kapalıyken aşağıdaki sıra,
                    açıkken rastgele. Tek düğme — açıkken renklenir, altındaki
                    nokta uzaktan bakınca da durumu belli eder. */}
                <button
                  onClick={() => setShuffle(selectedList, !selectedList.shuffle)}
                  aria-pressed={selectedList.shuffle}
                  className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                  style={{ background: selectedList.shuffle ? "rgba(233,30,140,0.18)" : "rgba(255,255,255,0.08)" }}
                  title={
                    selectedList.shuffle
                      ? "Karışık açık — şarkılar rastgele sırayla çalar"
                      : "Karışık kapalı — şarkılar aşağıdaki sırayla çalar"
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M16 3l4 4-4 4M16 13l4 4-4 4M20 7h-4.2a4 4 0 00-3.3 1.8l-4 6A4 4 0 015.2 17H3M3 7h2.2a4 4 0 013.3 1.8l.7 1M20 17h-4.2a4 4 0 01-3.3-1.8l-.7-1"
                      stroke={selectedList.shuffle ? "#f9a8d4" : "#9ca3af"}
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {selectedList.shuffle && (
                    <span
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{ background: "#e91e8c" }}
                    />
                  )}
                </button>
                {selectedSource && (
                  <>
                    <button
                      onClick={() => toggleAutoSync(selectedList)}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                      style={{
                        background: selectedSource.auto_sync ? "rgba(255,0,0,0.12)" : "rgba(255,255,255,0.08)",
                        color: selectedSource.auto_sync ? "#fca5a5" : "#9ca3af",
                      }}
                      title={
                        selectedSource.auto_sync
                          ? "YouTube listesine eklenen yeni şarkılar her gün buraya da eklenir"
                          : "Otomatik güncelleme kapalı — liste olduğu gibi kalır"
                      }
                    >
                      {selectedSource.auto_sync ? "Senkron açık" : "Senkron kapalı"}
                    </button>
                    <button
                      onClick={() => syncNow(selectedList)}
                      disabled={syncingId !== null}
                      className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                      title="YouTube'dan şimdi güncelle"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={syncingId === selectedList.id ? "animate-spin" : ""}>
                        <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  onClick={onRename}
                  className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                  title="Yeniden adlandır"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#9ca3af" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                </button>
                <button
                  onClick={() => deleteList(selectedList)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ background: "rgba(239,68,68,0.1)" }}
                  title="Listeyi sil"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
                <span className="w-px h-6 bg-white/10 mx-0.5" />
              </>
            )}

            <button
              onClick={onImportPlaylist}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background: "#FF0000", color: "white" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
              Playlist Ekle
            </button>
            <button
              onClick={onAddSong}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background: "#e91e8c", color: "white" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
              Şarkı Ekle
            </button>

            {/* Katalog araması — hem rayı hem şarkıları süzer */}
            <div className="relative flex-1 min-w-[220px]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2">
                <circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Katalogda şarkı veya sanatçı ara..."
                className="w-full rounded-xl pl-9 pr-9 py-2 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
                  title="Aramayı temizle"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              )}
            </div>
          </div>

          {(syncNote || orderError || playNote) && (
            <div className="mt-2 flex flex-col gap-1.5">
              {playNote && (
                <button
                  onClick={() => setPlayNote("")}
                  className="text-xs rounded-xl px-3 py-2 text-left"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
                >
                  {playNote}
                </button>
              )}
              {syncNote && (
                <button
                  onClick={() => setSyncNote("")}
                  className="text-xs rounded-xl px-3 py-2 text-left"
                  style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}
                >
                  {syncNote}
                </button>
              )}
              {orderError && (
                <p className="text-xs rounded-xl px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                  {orderError}
                </p>
              )}
            </div>
          )}

          {orderable && visibleSongs.length > 1 && (
            <p className="text-[#4b5563] text-[11px] mt-2">
              {selectedList?.shuffle
                ? "Sürükleyerek ya da oklarla sıralayabilirsiniz — liste karışık modda olduğu için sıra çalmayı etkilemez."
                : "Sürükleyerek ya da oklarla sıralayın; liste bu sırayla çalar."}
              {savingOrder && <span> · kaydediliyor</span>}
            </p>
          )}
        </div>

        {/* Şarkılar */}
        {loading ? (
          <div className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor...</div>
        ) : visibleSongs.length === 0 ? (
          <div className="py-10 text-center text-[#6b7280] text-sm">
            {filtering ? "Eşleşen şarkı yok" : selectedList ? "Bu listede henüz şarkı yok" : "Henüz şarkı yok"}
          </div>
        ) : (
          visibleSongs.map((song, i) => (
            <div
              key={song.venueSongId}
              draggable={orderable}
              onDragStart={() => orderable && setDragIndex(i)}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setDragOverIndex(i);
              }}
              onDrop={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                moveSong(dragIndex, i);
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors ${orderable ? "cursor-grab active:cursor-grabbing" : ""}`}
              style={{
                borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                opacity: dragIndex === i ? 0.4 : 1,
                background: dragOverIndex === i && dragIndex !== i ? "rgba(233,30,140,0.08)" : undefined,
              }}
            >
              {/* Liste içi sıra: sürükle-bırak ya da oklar */}
              {orderable && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveSong(i, i - 1)}
                      disabled={i === 0}
                      className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                      title="Yukarı taşı"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button
                      onClick={() => moveSong(i, i + 1)}
                      disabled={i === visibleSongs.length - 1}
                      className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                      title="Aşağı taşı"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                  <span className="text-[#4b5563] text-xs tabular-nums w-6 text-right">{i + 1}</span>
                </div>
              )}

              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/10">
                {song.album_cover_url ? (
                  <Image src={song.album_cover_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{song.title}</p>
                <p className="text-[#6b7280] text-xs truncate">
                  {song.artist} {song.duration_ms ? `· ${formatDur(song.duration_ms)}` : ""} · {song.play_count} çalınma
                  {viewId === ALL && (memberships[song.id] ?? []).length > 0
                    ? ` · ${(memberships[song.id] ?? [])
                        .map((id) => playlists.find((p) => p.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                </p>
              </div>

              {/* Gizli şarkılar satırda da belli olsun — menüye girmeden görülür */}
              {!song.in_venue_list && (
                <span
                  className="text-[10px] px-2 py-1 rounded-md font-medium shrink-0"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
                  title="Müşteriden gizli — otomatik de çalmaz"
                >
                  Gizli
                </span>
              )}

              {/* Tüm satır işlemleri tek menüde: sıraya al, gizle/göster, listeye
                  ekle, listeden çıkar, mekandan kaldır */}
              <SongRowMenu song={song} lib={lib} playback={playback} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
