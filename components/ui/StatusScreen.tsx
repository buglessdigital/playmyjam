import type { ReactNode } from "react";

// Hata ve 404 ekranlarının ortak iskeleti: koyu zemin, ortada kısa açıklama ve eylemler
export default function StatusScreen({
  eyebrow,
  title,
  desc,
  children,
  footnote,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-[#0f0a18] px-6 py-16 text-white">
      <div className="w-full max-w-md">
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">{eyebrow}</p>
        <h1 className="mt-3 text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-400">{desc}</p>
        <div className="mt-8 flex flex-wrap gap-3">{children}</div>
        {footnote && <p className="mt-8 text-xs text-gray-600">{footnote}</p>}
      </div>
    </main>
  );
}

export const primaryButtonClass =
  "rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white active:bg-purple-700";
export const secondaryButtonClass =
  "rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white active:bg-white/10";
