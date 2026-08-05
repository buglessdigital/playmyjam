"use client";

import { useI18n, type Lang } from "@/lib/i18n";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "tr", label: "TR" },
  { value: "en", label: "EN" },
];

/** İki dilli site için kompakt dil anahtarı (header, footer, ayarlar). */
export default function LangToggle({ className = "" }: { className?: string }) {
  const { lang, t, setLang } = useI18n();

  return (
    <div
      role="group"
      aria-label={t.lang.switchTo}
      className={`inline-flex shrink-0 rounded-full border border-white/15 p-0.5 text-[11px] font-bold ${className}`}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLang(option.value)}
          aria-pressed={lang === option.value}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            lang === option.value ? "bg-white text-black" : "text-gray-300 hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
