"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Tek satırda kalan başlık: metin uzadıkça punto, sütuna sığana kadar küçülür.
 * Böylece kapak yanındaki blok hep aynı yükseklikte durur — uzun liste adları
 * alt satıra taşıp düzeni oynatmaz.
 *
 * Punto doğrudan DOM'a yazılır (state yok): ölçüm-render döngüsü oluşmasın.
 */
export default function FitTitle({
  text,
  max = 92,
  min = 22,
  className = "",
}: {
  text: string;
  max?: number;
  min?: number;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = textRef.current;
    if (!box || !span) return;

    const fit = () => {
      const available = box.clientWidth;
      if (!available) return;

      let size = max;
      span.style.fontSize = `${size}px`;
      const needed = span.scrollWidth;

      if (needed > available) {
        // Önce orantıyla tek adımda yaklaş, sonra birer punto ince ayar
        size = Math.max(min, Math.floor((size * available) / needed));
        span.style.fontSize = `${size}px`;
        while (size > min && span.scrollWidth > available) {
          size -= 1;
          span.style.fontSize = `${size}px`;
        }
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text, max, min]);

  return (
    <div ref={boxRef} className={`w-full overflow-hidden ${className}`}>
      <span
        ref={textRef}
        className="block whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ fontSize: max, lineHeight: 1.05 }}
      >
        {text}
      </span>
    </div>
  );
}
