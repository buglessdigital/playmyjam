"use client";

import { useRef, useState } from "react";
import { formatTime } from "./usePlayback";

// Klavyeyle sarma adımı (ok tuşları). Shift ile 4 katı.
const STEP_MS = 5_000;

/**
 * Alt bardaki ilerleme çubuğu — aynı zamanda sarma kolu.
 *
 * Sürükleme boyunca yalnızca ekrandaki imleç oynar (onPreview); komut parmak
 * kalkınca tek seferde gider (onCommit). Sürerken komut yollamak player'ı her
 * adımda yeniden tamponlatır ve sarma takırtılı hissettirirdi.
 *
 * Pointer olayları kullanılır: fare, dokunmatik ve kalem tek yoldan yürür.
 * setPointerCapture sayesinde parmak çubuğun dışına taşsa da sürükleme sürer.
 */
export default function SeekBar({
  progress,
  duration,
  disabled = false,
  onBegin,
  onPreview,
  onCommit,
  onCancel,
}: {
  progress: number;
  duration: number;
  disabled?: boolean;
  onBegin: () => void;
  onPreview: (ms: number) => void;
  onCommit: (ms: number) => void;
  onCancel: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Ref + state birlikte: olay işleyicileri render beklemeden karar versin,
  // görünüm de sürükleme sırasında büyüsün.
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);

  const seekable = !disabled && duration > 0;
  const pct = duration > 0 ? Math.min(Math.max(progress / duration, 0), 1) * 100 : 0;
  const active = dragging || hovering;

  // İmlecin yatay konumunu şarkı içindeki milisaniyeye çevir
  const msAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return ratio * duration;
  };

  const stopDrag = (e: React.PointerEvent, commit: boolean) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (commit) onCommit(msAt(e.clientX));
    else onCancel();
  };

  const nudge = (deltaMs: number) => {
    if (!seekable) return;
    onCommit(Math.min(Math.max(progress + deltaMs, 0), duration));
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[#6b7280] text-[10px] tabular-nums shrink-0">{formatTime(progress)}</span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={seekable ? 0 : -1}
        aria-label="Şarkı konumu"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round(progress / 1000)}
        aria-valuetext={`${formatTime(progress)} / ${formatTime(duration)}`}
        aria-disabled={!seekable}
        title={seekable ? "Sürükleyerek ya da tıklayarak şarkıyı sarabilirsiniz" : undefined}
        // touch-none: dokunmatikte sürükleme sayfayı kaydırmasın
        className={`relative flex-1 touch-none select-none py-2 -my-2 outline-none ${
          seekable ? "cursor-pointer" : "cursor-default"
        }`}
        onPointerDown={(e) => {
          if (!seekable || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          setDragging(true);
          onBegin();
          // Tek tıklama da sarmadır: basıldığı an imleç oraya taşınır
          onPreview(msAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) onPreview(msAt(e.clientX));
        }}
        onPointerUp={(e) => stopDrag(e, true)}
        onPointerCancel={(e) => stopDrag(e, false)}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        onKeyDown={(e) => {
          if (!seekable) return;
          const big = e.shiftKey ? 4 : 1;
          if (e.key === "ArrowLeft") nudge(-STEP_MS * big);
          else if (e.key === "ArrowRight") nudge(STEP_MS * big);
          else if (e.key === "Home") nudge(-duration);
          else if (e.key === "End") nudge(duration);
          else return;
          e.preventDefault();
        }}
      >
        <div
          className={`w-full rounded-full bg-white/10 transition-[height] ${active ? "h-1.5" : "h-1"}`}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg, #e91e8c, #8b5cf6)" }}
          />
        </div>

        {/* Tutamak: yalnızca üzerine gelince/sürüklerken görünür — boştayken
            çubuk ince bir çizgi olarak kalsın */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-opacity"
          style={{ left: `${pct}%`, opacity: seekable && active ? 1 : 0 }}
        />
      </div>

      <span className="text-[#6b7280] text-[10px] tabular-nums shrink-0">{formatTime(duration)}</span>
    </div>
  );
}
