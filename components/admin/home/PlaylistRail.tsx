"use client";

import ListCover from "./ListCover";
import PlaylistRowMenu from "./PlaylistRowMenu";
import { ALL, type Library } from "./useLibrary";

const railStyle = (selected: boolean, dim: boolean) => ({
  background: selected ? "rgba(233,30,140,0.12)" : "rgba(255,255,255,0.02)",
  border: `1px solid ${selected ? "rgba(233,30,140,0.45)" : "rgba(255,255,255,0.07)"}`,
  opacity: dim ? 0.45 : 1,
});

/** Ana ekranın sol sütunu: mekanın playlist'leri, çalma sırası ve liste araması. */
export default function PlaylistRail({
  lib,
  onNewList,
  onPick,
  onRename,
}: {
  lib: Library;
  onNewList: () => void;
  // Dar ekranda liste seçilince şarkı panosuna geçilir
  onPick?: () => void;
  // Satır menüsündeki "yeniden adlandır" bu kipi açar
  onRename: () => void;
}) {
  const {
    playlists,
    visiblePlaylists,
    queueLists,
    queuedByList,
    currentList,
    playNow,
    consumed,
    songs,
    viewId,
    setSelectedId: selectList,
    listQuery,
    setListQuery,
    filtering,
    matchesQuery,
    matchCountFor,
    countFor,
    coversByList,
    catalogCovers,
    sourceByList,
    setCustomerVisible,
  } = lib;

  const listFiltered = listQuery.trim().length > 0;

  const setSelectedId = (id: string) => {
    selectList(id);
    onPick?.();
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Playlist ara..."
            className="w-full rounded-xl pl-9 pr-9 py-2 text-xs text-white outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          {listQuery && (
            <button
              onClick={() => setListQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
              title="Aramayı temizle"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
        <button
          onClick={() => setSelectedId(ALL)}
          className="text-left rounded-2xl px-3.5 py-3 shrink-0 transition-all flex items-center gap-3"
          style={railStyle(viewId === ALL, false)}
        >
          <ListCover covers={catalogCovers} size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: viewId === ALL ? "#f9a8d4" : "#e5e7eb" }}>
              Tüm Şarkılar
            </p>
            <p className="text-[#6b7280] text-[11px] mt-0.5">
              {songs.length} şarkı
              {filtering ? ` · ${songs.filter(matchesQuery).length} eşleşme` : ""}
            </p>
          </div>
        </button>

        {visiblePlaylists.map((p) => {
          const total = countFor(p.id);
          const matches = filtering ? matchCountFor(p.id) : total;
          const source = sourceByList[p.id];
          const isCurrent = currentList?.id === p.id;
          const done = consumed[p.id] ?? 0;
          // "Sırada" artık playlist satırından değil KUYRUKTAN okunur: elle
          // sıraya eklenmiş, hâlâ bekleyen şarkı sayısı.
          const queuedSongs = queuedByList[p.id] ?? 0;

          return (
            <div
              key={p.id}
              className="group rounded-2xl shrink-0 transition-all flex items-stretch"
              style={railStyle(viewId === p.id, filtering && matches === 0)}
            >
              <button onClick={() => setSelectedId(p.id)} className="text-left px-3.5 py-3 flex-1 min-w-0 flex items-center gap-3">
                {/* Kapağın üstünde beliren play: sırayı beklemeden bu listeyi çalar */}
                <span className="relative shrink-0">
                  <ListCover covers={coversByList[p.id] ?? []} size={40} />
                  {!isCurrent && total > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Çalmaya başlayan liste orta panoya da gelsin —
                        // rozet ve şarkı listesi aynı listeyi göstersin.
                        setSelectedId(p.id);
                        void playNow(p);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedId(p.id);
                        void playNow(p);
                      }}
                      title={`"${p.name}" listesini şimdi çal`}
                      className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      style={{ background: "rgba(0,0,0,0.55)" }}
                    >
                      <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#22c55e" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="#0b1220">
                          <path d="M8 5.5v13l11-6.5L8 5.5z" />
                        </svg>
                      </span>
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isCurrent ? (
                      <span
                        className="w-4 h-4 rounded-md shrink-0 flex items-center justify-center"
                        style={{ background: "#22c55e" }}
                        title="Şu an bu liste çalıyor"
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="#0b1220">
                          <path d="M8 5.5v13l11-6.5L8 5.5z" />
                        </svg>
                      </span>
                    ) : queuedSongs > 0 ? (
                      <span
                        className="w-4 h-4 rounded-md shrink-0 text-[10px] font-bold flex items-center justify-center"
                        style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
                        title={`Sıraya eklendi — ${queuedSongs} şarkısı çalan şarkıdan sonra çalacak`}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                          <path d="M4 6h11M4 12h11M4 18h7M20 10v8m-4-4h8" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </span>
                    ) : (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: "rgba(255,255,255,0.2)" }}
                      />
                    )}
                    <p className="text-sm font-semibold truncate" style={{ color: viewId === p.id ? "#f9a8d4" : "#e5e7eb" }}>
                      {p.name}
                    </p>
                    {/* Senkron artık her listede açık — durum rozeti yalnızca
                        bozukken görünür, sağlıklı hal sessizdir. */}
                    {source?.last_error && (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="shrink-0 ml-auto"
                        aria-label="Senkron hatası"
                      >
                        <path
                          d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45"
                          stroke="#f87171"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </div>
                  <p className="text-[#6b7280] text-[11px] mt-0.5">
                    {total} şarkı
                    {filtering
                      ? ` · ${matches} eşleşme`
                      : isCurrent
                        ? ` · Çalıyor ${done}/${total}`
                        : queuedSongs > 0
                          ? ` · Sırada ${queuedSongs} şarkı`
                          : ""}
                    {/* Müşteri aktifliği artık satırın sağındaki göz düğmesinde;
                        metinde tekrarlamıyoruz. */}
                  </p>
                </div>
              </button>

              {/* Çalma sırası, aktiflik, ad ve silme buradan — şarkı satırındaki
                  "⋮" menüsüyle aynı yerleşim. */}
              <div className="flex items-center gap-0.5 pr-2 shrink-0">
                {/* Müşteri aktifliği (0040) menüden çıkıp raya taşındı: mekanın
                    en sık çevirdiği anahtar, tek dokunuşla ve uzaktan okunur.
                    Kapalı liste otomatik çalmaya devam eder, sadece müşteride
                    görünmez. */}
                <button
                  onClick={() => setCustomerVisible(p, !p.customer_visible)}
                  aria-pressed={p.customer_visible}
                  className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
                  style={{
                    background: p.customer_visible ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.05)",
                    color: p.customer_visible ? "#22c55e" : "#6b7280",
                  }}
                  title={
                    p.customer_visible
                      ? "Müşteriye açık — bu listeden şarkı seçebiliyorlar. Kapatmak için tıklayın"
                      : "Müşteriye kapalı — liste otomatik çalar ama müşteride görünmez. Açmak için tıklayın"
                  }
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                    {!p.customer_visible && (
                      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    )}
                  </svg>
                </button>
                <PlaylistRowMenu playlist={p} lib={lib} orderable={!listFiltered} onRename={onRename} />
              </div>
            </div>
          );
        })}

        {listFiltered && visiblePlaylists.length === 0 && (
          <p className="text-[#6b7280] text-[11px] px-1">Eşleşen playlist yok</p>
        )}

        <button
          onClick={onNewList}
          className="rounded-2xl px-3.5 py-3 text-sm font-semibold shrink-0"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.2)", color: "#9ca3af" }}
        >
          + Yeni Liste
        </button>

        {playlists.length > 0 && queueLists.length === 0 && (
          <p className="text-[11px] px-1 leading-relaxed" style={{ color: "#f59e0b" }}>
            Çalma sırası boş — tüm katalogdan karışık çalınıyor. Bir listenin ▶ tuşuna basın.
          </p>
        )}
      </div>
    </div>
  );
}
