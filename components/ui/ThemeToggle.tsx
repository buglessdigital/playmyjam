"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { useT } from "@/lib/i18n";

/** Müşteri panelinin tema seçimi: koyu / açık / telefonun ayarı (bkz. lib/theme.ts) */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useT();
  const pref = useThemePref();
  const options: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
    { value: "dark", label: t.theme.dark, Icon: Moon },
    { value: "light", label: t.theme.light, Icon: Sun },
    { value: "system", label: t.theme.system, Icon: Monitor },
  ];

  return (
    <div
      role="group"
      aria-label={t.theme.label}
      className={`inline-flex shrink-0 rounded-full border border-ink/15 p-0.5 text-[11px] font-bold ${className}`}
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setThemePref(value)}
          aria-pressed={pref === value}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
            pref === value ? "bg-ink text-canvas" : "text-ink/70 hover:text-ink"
          }`}
        >
          <Icon size={12} strokeWidth={2.4} />
          {label}
        </button>
      ))}
    </div>
  );
}
