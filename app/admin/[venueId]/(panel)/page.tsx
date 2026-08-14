"use client";

import { Suspense, use, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useVenueDbId } from "@/lib/venue-db-id";
import HomeModals, { type ModalKind } from "@/components/admin/home/HomeModals";
import LibraryPane from "@/components/admin/home/LibraryPane";
import PaneResizer from "@/components/admin/home/PaneResizer";
import PlayerBar from "@/components/admin/home/PlayerBar";
import PlaylistRail from "@/components/admin/home/PlaylistRail";
import QueuePane from "@/components/admin/home/QueuePane";
import { ALL, useLibrary } from "@/components/admin/home/useLibrary";
import { usePlayback } from "@/components/admin/home/usePlayback";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Pane = "lists" | "songs" | "queue";

const PANES: { id: Pane; label: string }[] = [
  { id: "lists", label: "Listeler" },
  { id: "songs", label: "Şarkılar" },
  { id: "queue", label: "Sırada" },
];

// Playlist rayının genişliği kenarındaki çizgiden sürüklenerek ayarlanır ve
// cihazda saklanır — uzun liste adları olan mekan her açılışta yeniden
// genişletmek zorunda kalmasın. localStorage dış kaynak olduğu için state
// yerine abonelikle okunur: sunucu render'ı hep varsayılan, hidrasyon uyuşur.
const RAIL_KEY = "pmj-admin-rail-width";
const RAIL_MIN = 200;
const RAIL_MAX = 520;
const RAIL_DEFAULT = 280;

const railListeners = new Set<() => void>();

const subscribeRail = (cb: () => void) => {
  railListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    railListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

const readRailWidth = () => {
  const stored = Number(localStorage.getItem(RAIL_KEY));
  if (!Number.isFinite(stored) || stored <= 0) return RAIL_DEFAULT;
  return Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(stored)));
};

const writeRailWidth = (value: number) => {
  localStorage.setItem(RAIL_KEY, String(value));
  railListeners.forEach((cb) => cb());
};

export default function AdminDashboard({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <AdminDashboardContent params={params} />
    </Suspense>
  );
}

/**
 * Ana ekran: tek sayfada playlist rayı (sol), seçili listenin şarkıları (orta),
 * sıradaki şarkılar (sağ) ve altta oynatma barı. Mekan çalışanı gece boyunca
 * bu ekrandan çıkmadan iş görebilsin diye her şey aynı yerde.
 */
function AdminDashboardContent({ params }: Props) {
  const { venueId } = use(params);
  const searchParams = useSearchParams();
  // Dışarıdan ?list=... ile gelindiğinde ilgili liste seçili başlar
  const initialListId = searchParams.get("list") ?? ALL;
  // Google'dan dönüşte (?youtube=connected|youtube_error) içe aktarma kutusu
  // kendiliğinden açılır: kullanıcı hesabı bağlamak için oradan çıkmıştı.
  const youtubeReturn = searchParams.get("youtube") ?? searchParams.get("youtube_error");

  // Kimlik paylaşımlı çözücüden gelir: kenar çubuğu da aynı sonucu kullanır,
  // sayfalar arası gezinmede yeniden sorulmaz (bkz. lib/venue-db-id.ts).
  const venueDbId = useVenueDbId(venueId);
  const [modal, setModal] = useState<ModalKind>(youtubeReturn ? "import" : null);
  // Dar ekranda üç sütun sığmaz: aynı anda tek pano gösterilir
  const [pane, setPane] = useState<Pane>("songs");
  const railWidth = useSyncExternalStore(subscribeRail, readRailWidth, () => RAIL_DEFAULT);
  const setRailWidth = useCallback((w: number) => writeRailWidth(w), []);
  const resetRailWidth = useCallback(() => writeRailWidth(RAIL_DEFAULT), []);

  // Sıra önemli: "hangi liste çalıyor" kuyruktan okunur, rayın rozeti de onu
  // gösterir — bu yüzden playback önce kurulur.
  const playback = usePlayback(venueDbId);
  const lib = useLibrary(venueDbId, initialListId, playback);

  // Kuyruktaki "sıraya eklenen liste" bloklarının başlığında adı yazsın
  const playlistNames = useMemo(
    () => Object.fromEntries(lib.playlists.map((p) => [p.id, p.name])),
    [lib.playlists]
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Dar ekran pano seçici */}
      <div className="lg:hidden shrink-0 flex gap-1 p-2 border-b border-white/10">
        {PANES.map((p) => (
          <button
            key={p.id}
            onClick={() => setPane(p.id)}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: pane === p.id ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.04)",
              color: pane === p.id ? "#f9a8d4" : "#9ca3af",
            }}
          >
            {p.label}
            {p.id === "queue" && playback.queue.length > 0 ? ` (${playback.queue.length})` : ""}
          </button>
        ))}
      </div>

      <div
        className="flex-1 min-h-0 lg:grid"
        style={{ gridTemplateColumns: `${railWidth}px minmax(0,1fr) 340px` }}
      >
        <div
          className={`${pane === "lists" ? "flex" : "hidden"} lg:flex relative flex-col min-h-0 h-full min-w-0 lg:border-r border-white/10`}
        >
          <PaneResizer
            width={railWidth}
            min={RAIL_MIN}
            max={RAIL_MAX}
            onChange={setRailWidth}
            onReset={resetRailWidth}
            label="Liste panosu genişliği"
          />
          <PlaylistRail
            lib={lib}
            onNewList={() => setModal("newList")}
            onPick={() => setPane("songs")}
            onRename={() => setModal("rename")}
          />
        </div>

        <div className={`${pane === "songs" ? "flex" : "hidden"} lg:flex flex-col min-h-0 h-full min-w-0`}>
          <LibraryPane
            lib={lib}
            playback={playback}
            onAddSong={() => setModal("addSong")}
            onImportPlaylist={() => setModal("import")}
            onRename={() => setModal("rename")}
          />
        </div>

        <div
          className={`${pane === "queue" ? "flex" : "hidden"} lg:flex flex-col min-h-0 h-full lg:border-l border-white/10`}
        >
          <QueuePane
            playback={playback}
            onAddSong={() => setModal("addQueue")}
            contextName={lib.currentList?.name ?? null}
            playlistNames={playlistNames}
          />
        </div>
      </div>

      <PlayerBar
        playback={playback}
        venueId={venueId}
        // Otomatik çalma nereden geliyor: kuyruktaki liste ya da tüm katalog (0037)
        source={lib.currentList?.name ?? null}
      />

      <HomeModals kind={modal} onClose={() => setModal(null)} lib={lib} playback={playback} />
    </div>
  );
}
