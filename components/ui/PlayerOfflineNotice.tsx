"use client";

import { useT } from "@/lib/i18n";

/**
 * Mekanın oynatıcısı kapalıyken müşteri panelinde gösterilen uyarı. Süreler ve
 * ekleme akışı bu durumda gizlendiği için müşteri neden olduğunu buradan görür
 * (bkz. lib/player-status.ts).
 */
export default function PlayerOfflineNotice({ compact = false }: { compact?: boolean }) {
  const t = useT();

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl ${compact ? "px-3.5 py-2.5" : "p-4"}`}
      style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
        <path
          d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <p className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
          {t.playerOffline.title}
        </p>
        {!compact && <p className="mt-0.5 text-xs text-[#d97706]">{t.playerOffline.desc}</p>}
      </div>
    </div>
  );
}
