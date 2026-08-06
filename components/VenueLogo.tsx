"use client";

import { useState, type CSSProperties } from "react";

// Logo host'ları mekandan mekana değiştiği için next/image yerine düz <img>
// kullanılıyor (remotePatterns'a her host'u eklemek mümkün değil). Görsel
// yüklenemezse (kırık link, 403, silinmiş dosya) sessizce baş harfe düşülür.
function isDisplayableUrl(url: string) {
  return /^(https?:\/\/|\/)/i.test(url);
}

export function venueInitial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?";
}

export default function VenueLogo({
  name,
  logoUrl,
  className = "",
  style,
  fallbackClassName = "",
  fallbackStyle,
}: {
  name: string;
  logoUrl?: string | null;
  /** Kutunun boyutu/köşesi — hem logo hem baş harf için geçerli */
  className?: string;
  style?: CSSProperties;
  /** Yalnızca baş harf gösterilirken uygulanan sınıf/stil (arka plan, renk) */
  fallbackClassName?: string;
  fallbackStyle?: CSSProperties;
}) {
  // Hatalı adres state'te tutuluyor ki (canlı önizlemede) adres düzeltilince
  // bileşen yeniden denesin
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = logoUrl?.trim() ?? "";
  const showLogo = src !== "" && src !== failedSrc && isDisplayableUrl(src);

  if (showLogo) {
    return (
      <span
        className={`overflow-hidden ${className}`}
        style={{ ...style, background: "rgba(255,255,255,0.06)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`${className} ${fallbackClassName}`}
      style={{ ...style, ...fallbackStyle }}
      aria-hidden
    >
      {venueInitial(name)}
    </span>
  );
}
