"use client";

import { useEffect } from "react";
import { applyTheme, useResolvedTheme } from "@/lib/theme";

// Müşteri panelindeyken seçili temayı uygular; panelden çıkınca (vitrin,
// mekanlar listesi) koyuya döner. Bkz. lib/theme.ts
export default function ThemeSync() {
  const theme = useResolvedTheme();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => () => applyTheme(null), []);

  return null;
}
