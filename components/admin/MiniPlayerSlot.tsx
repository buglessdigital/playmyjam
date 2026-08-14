"use client";

import { useEffect, useRef } from "react";
import { MINI_SLOT_WIDTH, setMiniSlot } from "@/lib/mini-player-store";

/**
 * Oynatıcının oturacağı boş kutu — videonun kendisi burada değil, panel
 * kabuğunda asılı duruyor (bkz. MiniPlayer). Bu kutu yalnızca yer ayırır ve
 * "şuraya hizalan" der; böylece video akışın içindeymiş gibi görünür ama DOM'da
 * yer değiştirmediği için şarkı baştan yüklenmez.
 *
 * Oynatıcı hep açık olduğu için yuva da her zaman çizilir.
 */
export default function MiniPlayerSlot() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMiniSlot(ref.current);
    return () => setMiniSlot(null);
  }, []);

  return (
    <div
      ref={ref}
      className="shrink-0 aspect-video overflow-hidden rounded-lg bg-black"
      style={{ width: MINI_SLOT_WIDTH }}
    />
  );
}
