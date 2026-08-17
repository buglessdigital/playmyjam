"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { MINI_SLOT_WIDTH, setMiniSlot } from "@/lib/mini-player-store";
import { usePlayerHost } from "@/lib/player-host";

/**
 * Oynatıcının oturacağı boş kutu — videonun kendisi burada değil, panel
 * kabuğunda asılı duruyor (bkz. MiniPlayer). Bu kutu yalnızca yer ayırır ve
 * "şuraya hizalan" der; böylece video akışın içindeymiş gibi görünür ama DOM'da
 * yer değiştirmediği için şarkı baştan yüklenmez.
 *
 * Kumanda modunda (telefon) oynatıcı hiç kurulmadığı için yuva da yer ayırmaz:
 * kutunun yerini albüm kapağı alır, yoksa siyah bir dikdörtgen boşuna dururdu.
 */
export default function MiniPlayerSlot({ coverUrl }: { coverUrl?: string | null }) {
  const host = usePlayerHost();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host !== true) return;
    setMiniSlot(ref.current);
    return () => setMiniSlot(null);
  }, [host]);

  if (host !== true) {
    return (
      <div className="w-12 h-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {coverUrl ? (
          <Image src={coverUrl} alt="" width={48} height={48} sizes="48px" className="w-full h-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 18V5l12-2v13" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
              <circle cx="6" cy="18" r="3" stroke="#4b5563" strokeWidth="2" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="shrink-0 aspect-video overflow-hidden rounded-lg bg-black"
      style={{ width: MINI_SLOT_WIDTH }}
    />
  );
}
