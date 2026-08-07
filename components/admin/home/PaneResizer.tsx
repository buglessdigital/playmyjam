"use client";

import { useCallback, useState } from "react";

interface Props {
  /** Şu anki genişlik — sürükleme buradan devam eder. */
  width: number;
  min: number;
  max: number;
  /** Sürükleme sırasında her karede, bırakınca son kez çağrılır. */
  onChange: (width: number) => void;
  /** Çift tıklamada varsayılana dön. */
  onReset: () => void;
  label: string;
}

/**
 * Panonun sağ kenarındaki ayraç çizgisinin üstüne oturan sürükleme tutamacı.
 *
 * Kendi genişliğini bilmez: kapsayıcı panonun sol kenarını ölçüp imlecin ona
 * olan uzaklığını genişlik olarak verir — yani sağ kenarı sürüklemek panoyu
 * doğrudan büyütüp küçültür. `position: relative` bir panonun içine konmalıdır.
 */
export default function PaneResizer({ width, min, max, onChange, onReset, label }: Props) {
  const [dragging, setDragging] = useState(false);

  const start = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const move = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
      onChange(Math.min(max, Math.max(min, Math.round(e.clientX - left))));
    },
    [dragging, min, max, onChange],
  );

  const end = useCallback(() => setDragging(false), []);

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      title={`${label} (çift tıkla sıfırla)`}
      // Tutması kolay olsun diye çizgiden kalın bir şerit; taşan bir parça üst
      // kapsayıcılarda kırpılmasın diye tamamen panonun içinde durur.
      className="group hidden lg:block absolute inset-y-0 right-0 w-1.5 z-20 cursor-col-resize"
      style={{ touchAction: "none" }}
    >
      <div
        className="w-0.5 h-full ml-auto transition-colors group-hover:bg-[#e91e8c]/60"
        style={dragging ? { background: "#e91e8c" } : undefined}
      />
    </div>
  );
}
