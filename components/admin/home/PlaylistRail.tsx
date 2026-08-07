"use client";

import ListCover from "./ListCover";
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
}: {
  lib: Library;
  onNewList: () => void;
  // Dar ekranda liste seçilince şarkı panosuna geçilir
  onPick?: () => void;
}) {
  const {
    playlists,
    visiblePlaylists,
    activeLists,
    currentList,
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
    moveList,
    reordering,
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

        {visiblePlaylists.map((p, railIndex) => {
          const total = countFor(p.id);
          const matches = filtering ? matchCountFor(p.id) : total;
          const source = sourceByList[p.id];
          // Çalma sırası yalnızca aktif listeler üzerinden numaralanır;
          // pasif listelerin sırada yeri yoktur.
          const turn = p.is_active ? activeLists.findIndex((a) => a.id === p.id) + 1 : 0;
          const isCurrent = currentList?.id === p.id;
          const done = consumed[p.id] ?? 0;

          return (
            <div
              key={p.id}
              className="rounded-2xl shrink-0 transition-all flex items-stretch"
              style={railStyle(viewId === p.id, filtering && matches === 0)}
            >
              <button onClick={() => setSelectedId(p.id)} className="text-left px-3.5 py-3 flex-1 min-w-0 flex items-center gap-3">
                <ListCover covers={coversByList[p.id] ?? []} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {turn > 0 ? (
                      <span
                        className="w-4 h-4 rounded-md shrink-0 text-[10px] font-bold flex items-center justify-center"
                        style={{
                          background: isCurrent ? "#22c55e" : "rgba(34,197,94,0.15)",
                          color: isCurrent ? "#0b1220" : "#22c55e",
                        }}
                        title={isCurrent ? "Şu an bu liste çalıyor" : `Çalma sırası: ${turn}`}
                      >
                        {turn}
                      </span>
                    ) : (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: p.is_active ? "#22c55e" : "rgba(255,255,255,0.2)" }}
                      />
                    )}
                    <p className="text-sm font-semibold truncate" style={{ color: viewId === p.id ? "#f9a8d4" : "#e5e7eb" }}>
                      {p.name}
                    </p>
                    {source && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0 ml-auto">
                        <path
                          d="M3 6h13M3 12h13M3 18h9M19 9v8m0 0a2.5 2.5 0 1 1-3-2.45"
                          stroke={source.last_error ? "#f87171" : source.auto_sync ? "#FF0000" : "#4b5563"}
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
                        : ` · ${p.is_active ? "Aktif" : "Pasif"}`}
                  </p>
                </div>
              </button>

              {/* Listelerin çalma sırası buradan değiştirilir */}
              {!listFiltered && (
                <div className="flex flex-col justify-center gap-1 pr-2 py-2 shrink-0">
                  <button
                    onClick={() => moveList(p, -1)}
                    disabled={reordering || railIndex === 0}
                    className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                    title="Yukarı taşı"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button
                    onClick={() => moveList(p, 1)}
                    disabled={reordering || railIndex === visiblePlaylists.length - 1}
                    className="w-5 h-5 flex items-center justify-center rounded disabled:opacity-25"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                    title="Aşağı taşı"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              )}
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

        {playlists.length > 0 && !activeLists.length && (
          <p className="text-[11px] px-1 leading-relaxed" style={{ color: "#f59e0b" }}>
            Aktif playlist yok — sıra boşken tüm katalogdan rastgele çalınır.
          </p>
        )}
      </div>
    </div>
  );
}
