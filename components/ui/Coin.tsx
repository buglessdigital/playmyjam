import { useId } from "react";

// PlayMyJam jetonu — ortasında logo (üç çubuk) olan marka pembesi jeton.
// Müşteri panelinde ve vitrinde jeton/bakiye görsellerinde ortak kullanılır.
//
// Katmanlar: pembe kenar (degrade) → tırtıklı para kenarı → koyu mor yüz →
// logo. Logonun koyudan açığa üç tonu korunuyor ama koyu yüzde okunsun diye
// bir kademe açık; 20 px civarında da çubuklar seçilebiliyor. Açık temada da
// kendi koyu yüzü olduğu için zemine bağımlı değil.
export default function Coin({ size = 22 }: { size?: number }) {
  const id = useId();
  const rim = `${id}-rim`;
  const face = `${id}-face`;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={rim} x1="3" y1="1" x2="21" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff6fbf" />
          <stop offset="0.45" stopColor="#e91e8c" />
          <stop offset="1" stopColor="#8f0f52" />
        </linearGradient>
        <radialGradient id={face} cx="9.5" cy="8.5" r="11" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4a1740" />
          <stop offset="1" stopColor="#1e0a1c" />
        </radialGradient>
      </defs>

      {/* Kenar */}
      <circle cx="12" cy="12" r="11.5" fill={`url(#${rim})`} />
      {/* Tırtıklı para kenarı */}
      <circle cx="12" cy="12" r="10.4" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="0.55 0.75" />
      {/* Yüz */}
      <circle cx="12" cy="12" r="8.9" fill={`url(#${face})`} />
      <circle cx="12" cy="12" r="8.9" stroke="#ff8fd0" strokeOpacity="0.45" strokeWidth="0.5" />

      {/* Logo: uzun → kısa, dikeyde ortalı (public/logo-mark.png oranları) */}
      <rect x="7.75" y="7.4" width="2.5" height="9.2" rx="1.25" fill="#e0157f" />
      <rect x="10.75" y="8.45" width="2.5" height="7.1" rx="1.25" fill="#ff3fa4" />
      <rect x="13.75" y="9.75" width="2.5" height="4.5" rx="1.25" fill="#ff9ad4" />

      {/* Parlama */}
      <path d="M5.2 7.2A8.2 8.2 0 0 1 10 3.6" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
