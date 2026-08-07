"use client";

import Image from "next/image";

// Liste kapağı: listenin ilk şarkılarının kapaklarından üretilir. 4+ kapak varsa
// 2x2 mozaik, azsa tek görsel, hiç yoksa nota rozeti.
export default function ListCover({
  covers,
  size,
  rounded = "rounded-lg",
}: {
  covers: string[];
  size: number;
  rounded?: string;
}) {
  const base = `${rounded} overflow-hidden shrink-0`;

  if (covers.length >= 4) {
    const half = Math.round(size / 2);
    return (
      <div className={`${base} grid grid-cols-2 grid-rows-2`} style={{ width: size, height: size }}>
        {covers.slice(0, 4).map((url, i) => (
          <Image key={`${url}-${i}`} src={url} alt="" width={half} height={half} className="w-full h-full object-cover" />
        ))}
      </div>
    );
  }

  if (covers.length > 0) {
    return (
      <div className={base} style={{ width: size, height: size }}>
        <Image src={covers[0]} alt="" width={size} height={size} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`${base} flex items-center justify-center`}
      style={{ width: size, height: size, background: "linear-gradient(135deg, rgba(233,30,140,0.35), rgba(88,28,135,0.5))" }}
    >
      <svg width={Math.round(size * 0.42)} height={Math.round(size * 0.42)} viewBox="0 0 24 24" fill="none">
        <path d="M9 18V5l12-2v13" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="6" cy="18" r="3" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
      </svg>
    </div>
  );
}
