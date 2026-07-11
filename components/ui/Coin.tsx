import { useId } from "react";

// Altın jeton ikonu — müşteri panelinde jeton/bakiye görsellerinde ortak kullanılır
export default function Coin({ size = 22 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="0.55" stopColor="#f5a524" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#${id})`} />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
      <circle cx="12" cy="12" r="8.4" stroke="rgba(120,53,15,0.4)" strokeWidth="0.9" />
      <path d="M10.6 14.8V9.1l4-1v6.1" stroke="#78350f" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.4" cy="14.9" r="1.7" fill="#78350f" />
      <circle cx="13.4" cy="14.3" r="1.7" fill="#78350f" />
    </svg>
  );
}
