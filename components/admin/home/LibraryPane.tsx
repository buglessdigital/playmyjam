"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Binlerce şarkılık katalogda satırların tamamını DOM'a basmak paneli
// yavaşlatıyordu: her durum değişikliği (bir düğmeye basmak dahil) tüm listeyi
// yeniden çizdiriyor, her satırda kapak görseli ve menü bileşeni vardı. Artık
// yalnızca ekrandaki pencere + tampon çiziliyor, üstte/altta boşluk bırakan iki
// dolgu div'i kaydırma çubuğunu doğru tutuyor.
//
// Eşiğin altındaki listeler olduğu gibi çizilir — kısa listede pencereleme hem
// gereksiz hem de sürükle-bırakta risk.
const VIRTUAL_THRESHOLD = 60;
const OVERSCAN = 10;
const ROW_HEIGHT_FALLBACK = 61;

function useRowWindow(count: number, enabled: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({
    rowHeight: ROW_HEIGHT_FALLBACK,
    start: 0,
    end: VIRTUAL_THRESHOLD,
  });

  const measure = useCallback(() => {
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (!scroller || !list) return;

    // Satır yüksekliği ekrandaki gerçek satırdan okunur: yazı tipi ya da dolgu
    // değişirse sabit bir sayı listeyi kaydırır. Üstteki dolgu varken ilk çocuk
    // satır değildir; o turda son ölçülen değer korunur.
    const firstRow = list.firstElementChild as HTMLElement | null;
    const measured =
      firstRow?.dataset.row === "song" && firstRow.offsetHeight > 0 ? firstRow.offsetHeight : null;
    const scrollTop = scroller.scrollTop;
    const viewportHeight = scroller.clientHeight;
    // Listenin kaydırma kabındaki başlangıcı: üstünde kapak ve araç çubuğu var.
    // offsetTop kullanılmıyor — iki öğenin offsetParent'ı farklı olabilir;
    // ekran koordinatları her düzende doğru sonucu verir.
    const listTop =
      list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scrollTop;

    setRange((prev) => {
      const rowHeight = measured ?? prev.rowHeight;
      const start = Math.max(0, Math.floor((scrollTop - listTop) / rowHeight) - OVERSCAN);
      const end = Math.min(count, start + Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2);
      return prev.rowHeight === rowHeight && prev.start === start && prev.end === end
        ? prev
        : { rowHeight, start, end };
    });
  }, [count]);

  useLayoutEffect(() => {
    if (!enabled) return;
    measure();
  }, [enabled, measure]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!enabled || !scroller) return;
    // passive: kaydırma sırasında tarayıcı beklemesin
    scroller.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      scroller.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [enabled, measure]);

  const start = enabled ? Math.min(range.start, Math.max(0, count - 1)) : 0;
  const end = enabled ? Math.min(count, Math.max(range.end, start + 1)) : count;
  const rowHeight = range.rowHeight;

  return {
    scrollRef,
    listRef,
    start,
    end,
    padTop: enabled ? start * rowHeight : 0,
    padBottom: enabled ? Math.max(0, count - end) * rowHeight : 0,
  };
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
    queuedByList,
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
    setShuffle,
    setCustomerVisible,
    syncNow,
    syncingId,
    syncNote,
    setSyncNote,
    deleteList,
  } = lib;

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [playNote, setPlayNote] = useState("");
  // Satırdaki "şimdi çal" isteği sürerken düğmeler kilitli
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);

  const totalMs = visibleSongs.reduce((n, s) => n + (s.duration_ms || 0), 0);

  // Sahnedeki şarkı listede de belli olsun: video kimliğinden eşleşir, böylece
  // şarkı ister listeden otomatik gelsin ister müşteriden, aynı satır renklenir.
  const playingVideoId = playback.nowPlaying?.video_id ?? null;

  const virtual = visibleSongs.length > VIRTUAL_THRESHOLD;
  const { scrollRef, listRef, start, end, padTop, padBottom } = useRowWindow(
    visibleSongs.length,
    virtual
  );

  // Kapak/başlık bloğu araç çubuğunun altına kayınca liste adı çubukta belirir —
  // uzun listede kaydırırken hangi listede olduğun kaybolmasın diye.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [condensed, setCondensed] = useState(false);
  useEffect(() => {
    const scroller = scrollRef.current;
    const title = titleRef.current;
    if (!scroller || !title) return;
    const io = new IntersectionObserver(([e]) => setCondensed(!e.isIntersecting), {
      root: scroller,
      // Yapışık araç çubuğu üstte ~56px yer kaplıyor: başlık onun ARDINA
      // geçtiğinde tetiklensin, sadece kaydırma alanından çıkınca değil.
      rootMargin: "-56px 0px 0px 0px",
    });
    io.observe(title);
    return () => io.disconnect();
  }, [scrollRef]);

  const isPlaying = !!selectedList && currentList?.id === selectedList.id;
  // "Sırada" artık listenin bir bayrağı değil, KUYRUKTAKİ gerçek satırlar: elle
  // sıraya eklenmiş ve hâlâ bekleyen şarkı sayısı (rayla aynı kaynak).
  const queuedSongs = selectedList ? queuedByList[selectedList.id] ?? 0 : 0;

  const statusLine = !selectedList
    ? "Mekanın tüm şarkıları — müşteriler hangi liste sırada olursa olsun bu havuzun tamamından seçebilir"
    : isPlaying
      ? `Şu an çalıyor — bu turda ${consumed[selectedList.id] ?? 0}/${countFor(selectedList.id)} şarkı çalındı`
      : queuedSongs > 0
        ? `Sırada ${queuedSongs} şarkı — çalan şarkıdan sonra bu liste çalacak, bitince eski liste kaldığı yerden devam eder`
        : "Sırada değil — şarkıları müşteri yine de seçebilir, otomatik çalmaz";

  // Çubuktaki liste adı: yer kaplamasın diye hep basılı ama genişliği/opaklığı
  // sıfır — böylece belirip kaybolurken düğmeler zıplamadan kayar.
  const condensedTitle = (
    <span
      aria-hidden={!condensed}
      className={`shrink-0 truncate font-bold text-white text-[15px] transition-all duration-200 ${
        condensed ? "max-w-[240px] opacity-100 ml-1 mr-0.5" : "max-w-0 opacity-0"
      }`}
      title={selectedList ? selectedList.name : "Tüm Şarkılar"}
    >
      {selectedList ? selectedList.name : "Tüm Şarkılar"}
    </span>
  );

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Tek kaydırma alanı: kapak yukarı kayar, araç çubuğu üstte yapışık kalır */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
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
              <h1 ref={titleRef} className="text-white font-extrabold mt-2.5 mb-3.5">
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
                  {/* auto_sync artık elle kapatılmıyor; false ise liste
                      üst üste hata verdiği için donduruldu demektir. */}
                  <span style={{ color: selectedSource.last_error ? "#f87171" : selectedSource.auto_sync ? "#22c55e" : "#6b7280" }}>
                    {selectedSource.last_error
                      ? `Senkron hatası: ${selectedSource.last_error}`
                      : selectedSource.auto_sync
                        ? "Her gün otomatik güncelleniyor"
                        : "Senkron durduruldu — YouTube listesine ulaşılamıyor"}
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
            {!selectedList && condensedTitle}
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

                {condensedTitle}

                {/* Sıraya ekle: liste tek blok halinde çalan şarkıdan HEMEN
                    SONRAYA girer (Spotify gibi). Çalan liste kesilmez, blok
                    bitince kaldığı yerden devam eder. Zaten sıradaysa düğme
                    "çıkar"a döner. */}
                <button
                  onClick={async () => {
                    const res = await setQueued(selectedList, queuedSongs === 0);
                    if (!res.ok) setPlayNote(res.error);
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                  style={{
                    background: queuedSongs > 0 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                    color: queuedSongs > 0 ? "#22c55e" : "#9ca3af",
                  }}
                  title={
                    queuedSongs > 0
                      ? `Sırada ${queuedSongs} şarkısı var — sıradan çıkarmak için tıklayın`
                      : "Sıraya ekle — çalan şarkı bitince bu liste çalar, sonra eski liste kaldığı yerden devam eder"
                  }
                >
                  {queuedSongs > 0 ? "Sıradan çıkar" : "Sıraya Ekle"}
                </button>

                {/* Müşteri aktifliği (0040): kapalıyken listenin şarkıları müşteri
                    panelinde hiç görünmez. Otomatik çalmayı etkilemez — pasif
                    liste sırası gelince yine çalar. */}
                <button
                  onClick={() => setCustomerVisible(selectedList, !selectedList.customer_visible)}
                  aria-pressed={selectedList.customer_visible}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                  style={{
                    background: selectedList.customer_visible ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.08)",
                    color: selectedList.customer_visible ? "#93c5fd" : "#9ca3af",
                  }}
                  title={
                    selectedList.customer_visible
                      ? "Müşteriye açık — bu listedeki şarkılar müşteri panelinde görünür ve jetonla istenebilir. Kapatmak için tıklayın"
                      : "Müşteriye kapalı — bu listedeki şarkılar müşteride görünmez. Otomatik çalmaya devam eder. Açmak için tıklayın"
                  }
                >
                  {selectedList.customer_visible ? "Müşteriye açık" : "Müşteriye kapalı"}
                </button>

                {/* "Tek seferlik" düğmesi kalktı: artık kural her listede aynı —
                    turunu bitiren liste kuyruktan düşer, kuyrukta kalan son liste
                    ise baştan çalmaya devam eder. */}
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
                {/* Senkron her YouTube listesinde daima açık — açma/kapama
                    düğmesi yok. Kalan tek düğme "şimdi güncelle": mekan
                    günlük cron'u beklemeden elle tetiklemek isteyebilir. */}
                {selectedSource && (
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
          <div ref={listRef}>
            {padTop > 0 && <div style={{ height: padTop }} aria-hidden />}
            {visibleSongs.slice(start, end).map((song, offset) => {
              const i = start + offset;
              const nowPlayingRow = !!playingVideoId && song.youtube_video_id === playingVideoId;
              return (
            <div
              key={song.venueSongId}
              data-row="song"
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
              className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors ${orderable ? "cursor-grab active:cursor-grabbing" : ""}`}
              style={{
                borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                opacity: dragIndex === i ? 0.4 : 1,
                background:
                  dragOverIndex === i && dragIndex !== i
                    ? "rgba(233,30,140,0.08)"
                    : nowPlayingRow
                      ? "rgba(233,30,140,0.06)"
                      : undefined,
              }}
            >
              {/* Liste içi sıra: sürükle-bırak ya da satır menüsü */}
              {orderable && (
                <div className="flex items-center shrink-0">
                  <span className="text-[#4b5563] text-xs tabular-nums w-6 text-right">{i + 1}</span>
                </div>
              )}

              {/* Kapak + üstünde "şimdi çal": düğme yalnızca satırın üstüne
                  gelince (dokunmatikte hep) görünür, satır sadeleşir.
                  Bu şarkı sahneye çıkar, çalan şarkı yarıda kesilir. Bir liste
                  görüntüleniyorsa rotasyon imleci de buraya taşınır — listenin
                  devamı (bir sonraki şarkıdan itibaren) sıraya girer.
                  Sahnedeki şarkı müşteriye aitse düğme kapalı. */}
              <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/10">
                {song.album_cover_url ? (
                  <Image src={song.album_cover_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                  </div>
                )}
                <button
                  onClick={async () => {
                    // Kilitliyken düğme artık kaybolmuyor: sebebi SÖYLER.
                    // Eskiden hiç çizilmiyordu ve admin boş kapağa üst üste
                    // basıp "panel beni duymuyor" diyordu.
                    if (playback.currentIsCustomer) {
                      setPlayNote("Müşterinin jetonla eklediği şarkı çalıyor — bitmeden başka şarkıya geçilemez.");
                      return;
                    }
                    setPlayNote("");
                    setPlayingSongId(song.id);
                    const res = await playback.playNow(
                      { song_id: song.id, playlist_id: viewId === ALL ? null : viewId },
                      {
                        youtube_video_id: song.youtube_video_id,
                        title: song.title,
                        artist: song.artist,
                        album_cover_url: song.album_cover_url,
                        duration_ms: song.duration_ms,
                      }
                    );
                    setPlayingSongId(null);
                    if (!res.ok) setPlayNote(res.error);
                    // İmleç ve tur ilerlemesi değişti: raydaki "çalıyor" işareti ve
                    // ilerleme sayacı tazelensin. Katalog değişmediği için tam
                    // yükleme değil, iki sorgusu olan rotasyon tazelemesi yeter.
                    else if (viewId !== ALL) lib.refreshRotation();
                  }}
                  disabled={playingSongId !== null}
                  className={
                    playingSongId !== null
                      ? // İstek yoldayken hiç görünmesin: kapak da örtülmemiş olur
                        "hidden"
                      : // DOKUNMATİKTE HEP GÖRÜNÜR. Eskiden "md:opacity-0" idi ve
                        // Tailwind 4'te hover varyantları yalnızca gerçek fare
                        // olan cihazlarda çalıştığı için mekandaki tablette
                        // (>=768 px, dokunmatik) düğme SAKLANIYOR ama tıklanabilir
                        // kalıyordu: kapağa dokunan admin görünmez düğmeye basıp
                        // farkında olmadan şarkıyı değiştiriyordu. Artık gizleme
                        // yalnızca fareli cihazlarda.
                        "absolute inset-0 flex items-center justify-center transition-opacity opacity-100 md:[@media(hover:hover)]:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  }
                  style={{ background: "rgba(0,0,0,0.55)" }}
                  title={
                    playback.currentIsCustomer
                      ? "Müşterinin eklediği şarkı çalıyor — yarıda kesilemez"
                      : viewId === ALL
                        ? "Şimdi çal — çalan şarkı kesilir"
                        : "Şimdi çal — çalan şarkı kesilir, liste buradan devam eder"
                  }
                >
                  {playback.currentIsCustomer ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#9ca3af" strokeWidth="2" />
                      <path d="M8 11V7a4 4 0 018 0v4" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e">
                      <path d="M8 5.5v13l11-6.5L8 5.5z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: nowPlayingRow ? "#e91e8c" : "#ffffff" }}
                  title={nowPlayingRow ? "Şu an çalıyor" : undefined}
                >
                  {song.title}
                </p>
                <p className="text-xs truncate" style={{ color: nowPlayingRow ? "#f9a8d4" : "#6b7280" }}>
                  {song.artist} {song.duration_ms ? `· ${formatDur(song.duration_ms)}` : ""} · {song.play_count} çalınma
                  {viewId === ALL && (memberships[song.id] ?? []).length > 0
                    ? ` · ${(memberships[song.id] ?? [])
                        .map((id) => playlists.find((p) => p.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                </p>
              </div>

              {/* Çalan satırın kuyruktakiyle aynı işareti — renge ek olarak
                  hareket, uzaktan bakınca da yakalanır */}
              {nowPlayingRow && (
                <span className="flex items-end gap-[2px] h-3.5 shrink-0" aria-hidden>
                  <span className="w-[3px] rounded-sm animate-pulse" style={{ height: "60%", background: "#e91e8c" }} />
                  <span className="w-[3px] rounded-sm animate-pulse" style={{ height: "100%", background: "#e91e8c", animationDelay: "150ms" }} />
                  <span className="w-[3px] rounded-sm animate-pulse" style={{ height: "40%", background: "#e91e8c", animationDelay: "300ms" }} />
                </span>
              )}

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
              );
            })}
            {padBottom > 0 && <div style={{ height: padBottom }} aria-hidden />}
          </div>
        )}
      </div>
    </div>
  );
}
