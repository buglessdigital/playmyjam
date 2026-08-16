"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import LangToggle from "@/components/ui/LangToggle";

const STORAGE_PREFIX = "pmj-vibe-intro:";

/**
 * Mekana ilk kez giren ziyaretçiye paneli 3 adımda anlatır (şarkını bul →
 * jeton al → sıraya ekle) ve "aradığın her şarkı bulunmayabilir" notunu verir.
 * Yeni kullanıcının takıldığı yer tam olarak bu sıralamaydı.
 *
 * Bir kez gösterilir. Giriş yapmayan ziyaretçiyi de kapsaması gerektiği için
 * işaret hesapta değil localStorage'da tutulur; mekan bazlı, çünkü her mekanın
 * kataloğu ayrı. localStorage okunamıyorsa (gizli mod) modal hiç açılmaz —
 * tekrar tekrar çıkıp rahatsız etmesindense hiç çıkmasın.
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

  const steps = [
    {
      title: t.vibeIntro.step1Title,
      desc: t.vibeIntro.step1Desc,
      color: "#e91e8c",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#e91e8c" strokeWidth="2" />
          <path d="M20 20l-3-3" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: t.vibeIntro.step2Title,
      desc: t.vibeIntro.step2Desc,
      color: "#fbbf24",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="#fbbf24" strokeWidth="2" />
          <circle cx="12" cy="12" r="3.5" stroke="#fbbf24" strokeWidth="1.6" />
        </svg>
      ),
    },
    {
      title: t.vibeIntro.step3Title,
      desc: t.vibeIntro.step3Desc,
      color: "#8b5cf6",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="13" height="2" rx="1" fill="#8b5cf6" />
          <rect x="3" y="11" width="10" height="2" rx="1" fill="#8b5cf6" />
          <rect x="3" y="16" width="7" height="2" rx="1" fill="#8b5cf6" />
          <path d="M18 12v8M14 16h8" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

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
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl"
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

        <ol className="mt-5 space-y-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="flex items-start gap-3 rounded-2xl p-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${step.color}1f`, border: `1px solid ${step.color}3d` }}
              >
                {step.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  <span style={{ color: step.color }}>{i + 1}.</span> {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#9ca3af]">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Katalog kısıtı: adımların ardından, "bulamazsam ne olacak" sorusunun cevabı */}
        <p className="mt-4 text-center text-xs leading-relaxed text-[#6b7280]">{t.vibeIntro.desc}</p>

        <button
          onClick={() => setOpen(false)}
          className="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
          style={{ background: "#e91e8c" }}
        >
          {t.vibeIntro.cta}
        </button>
      </div>
    </div>
  );
}
