"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import HomeModals, { type ModalKind } from "@/components/admin/home/HomeModals";
import LibraryPane from "@/components/admin/home/LibraryPane";
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
  // Dışarıdan ?list=... ile gelindiğinde ilgili liste seçili başlar
  const initialListId = useSearchParams().get("list") ?? ALL;

  const [venueDbId, setVenueDbId] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  // Dar ekranda üç sütun sığmaz: aynı anda tek pano gösterilir
  const [pane, setPane] = useState<Pane>("songs");

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("venues").select("id").eq("slug", venueId).single();
      if (!cancelled && data) setVenueDbId(data.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId, supabase]);

  const lib = useLibrary(venueDbId, initialListId);
  const playback = usePlayback(venueDbId);

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

      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <div
          className={`${pane === "lists" ? "flex" : "hidden"} lg:flex flex-col min-h-0 h-full lg:border-r border-white/10`}
        >
          <PlaylistRail lib={lib} onNewList={() => setModal("newList")} onPick={() => setPane("songs")} />
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
          <QueuePane playback={playback} onAddSong={() => setModal("addQueue")} />
        </div>
      </div>

      <PlayerBar playback={playback} venueId={venueId} />

      <HomeModals kind={modal} onClose={() => setModal(null)} lib={lib} playback={playback} />
    </div>
  );
}
