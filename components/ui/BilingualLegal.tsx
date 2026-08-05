"use client";

import { type ReactNode } from "react";
import LegalFooter from "@/components/ui/LegalFooter";
import { useI18n } from "@/lib/i18n";

// Yasal / kurumsal sayfaları iki dilli sunar (Türkçe varsayılan, İngilizce'ye geçiş).
// Her iki dilin içeriği de DOM'a basılır; dil değişimi yalnızca görünürlüğü değiştirir
// (SEO ve YouTube API denetimi için her iki metin de kaynakta mevcut kalır).
// Dil seçimi sitenin geneliyle ortak: buradan değiştirmek tüm siteyi çevirir.
export default function BilingualLegal({
  tr,
  en,
  hidePayment = false,
}: {
  tr: ReactNode;
  en: ReactNode;
  hidePayment?: boolean;
}) {
  const { lang, t, setLang } = useI18n();

  return (
    <>
      <div className="mx-auto flex max-w-3xl justify-end px-6 pt-8">
        <div className="inline-flex rounded-full border border-white/15 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setLang("tr")}
            aria-pressed={lang === "tr"}
            className={`rounded-full px-3 py-1 transition ${
              lang === "tr" ? "bg-white text-black" : "text-gray-300 hover:text-white"
            }`}
          >
            {t.lang.tr}
          </button>
          <button
            type="button"
            onClick={() => setLang("en")}
            aria-pressed={lang === "en"}
            className={`rounded-full px-3 py-1 transition ${
              lang === "en" ? "bg-white text-black" : "text-gray-300 hover:text-white"
            }`}
          >
            {t.lang.en}
          </button>
        </div>
      </div>

      <div lang="tr" className={lang === "tr" ? "" : "hidden"}>
        {tr}
      </div>
      <div lang="en" className={lang === "en" ? "" : "hidden"}>
        {en}
      </div>

      <LegalFooter hidePayment={hidePayment} />
    </>
  );
}
