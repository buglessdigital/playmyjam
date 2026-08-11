"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import LangToggle from "@/components/ui/LangToggle";

const STORAGE_PREFIX = "pmj-vibe-intro:";

/**
 * Mekana ilk kez giren ziyaretçiye "aradığın her şarkı bulunmayabilir" uyarısını
 * bir kez gösterir. Giriş yapmayan ziyaretçiyi de kapsaması gerektiği için işaret
 * hesapta değil localStorage'da tutulur; mekan bazlı, çünkü her mekanın kataloğu
 * ayrı. localStorage okunamıyorsa (gizli mod) modal hiç açılmaz — tekrar tekrar
 * çıkıp rahatsız etmesindense hiç çıkmasın.
 */
export default function VibeIntroModal({ venueId }: { venueId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_PREFIX + venueId) === "1") return;
      window.localStorage.setItem(STORAGE_PREFIX + venueId, "1");
    } catch {
      return;
    }
    setOpen(true);
  }, [venueId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vibe-intro-title"
    >
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 sm:rounded-3xl"
        style={{ background: "#1a0e2a" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal başlığın üstünü kapattığı için dil anahtarı burada da duruyor —
            İngilizce ziyaretçi metni okuyabilmek için modalı kapatmak zorunda kalmasın */}
        <div className="flex justify-end">
          <LangToggle />
        </div>

        <div
          className="mx-auto mb-4 mt-3 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(233,30,140,0.12)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z"
              stroke="#e91e8c"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 id="vibe-intro-title" className="text-center text-lg font-bold text-white">
          {t.vibeIntro.title}
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-[#9ca3af]">{t.vibeIntro.desc}</p>

        <button
          onClick={() => setOpen(false)}
          className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
          style={{ background: "#e91e8c" }}
        >
          {t.vibeIntro.cta}
        </button>
      </div>
    </div>
  );
}
