"use client";

import { fmt, useI18n } from "@/lib/i18n";

// Talep gönderildikten sonra çıkan kart. Yalnızca iki şey söyler: onay gelirse
// çaldırmanın kaça mal olacağı ve akıbetin alttaki şeritten (bkz.
// components/venue/RequestStatusBar) takip edileceği. Bildirim izni teklifi
// buradan çıkarıldı — kart okunmadan kapatılmasın diye kısa tutuluyor; teklif
// arama ekranındaki gönderildi kartında ve girişten dönüş bildiriminde duruyor.
//
// Açılırken arama ekranı KAPATILIR (bkz. BrowseClient.handleSuggest): şerit
// sabit konumlu ve z-40, tam ekran arama ise z-50 — arama açıkken şerit
// görünmüyordu ve müşteri ancak geri dönünce fark ediyordu. Kart kapanınca
// altında zaten duran şerit karşılıyor.
export default function RequestSentModal({
  title,
  artist,
  cost,
  tokenUnitPrice,
  onClose,
}: {
  title: string;
  artist: string;
  /** Onaylanan şarkının normal sıraya ekleme ücreti (jeton) */
  cost: number;
  /** Jeton başına TL — 0 ise yalnızca jeton yazılır */
  tokenUnitPrice: number;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();

  // Talep ücretsiz ama ONAY sonrası çaldırmak jeton harcıyor: müşteri bunu
  // kartı kapatmadan görsün, "onaylandı" bildirimiyle sürpriz olmasın.
  // Tutar bilinmiyorsa satır hiç yazılmaz — "undefined jeton" görünmesin.
  const tokens = Number.isFinite(cost) && cost > 0 ? cost : null;
  const price =
    tokens !== null && tokenUnitPrice > 0
      ? `${(tokens * tokenUnitPrice).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: 2 })}₺`
      : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 px-4 pb-24 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-[#fbbf24]/30 p-5"
        style={{ background: "linear-gradient(160deg, rgba(251,191,36,0.16), #150e22 60%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {/* Yeşil tik "şarkı çalacak" izlenimi veriyordu; talep henüz beklemede.
              Onun yerine şeritteki sarıyla aynı tonda, dolmakta olan bir saat. */}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbbf24]/15 ring-1 ring-inset ring-[#fbbf24]/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#fbbf24" strokeOpacity="0.28" strokeWidth="2" />
              {/* Dolan pay: çember uzunluğu 2πr ≈ 56.5 */}
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="#fbbf24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="56.5"
                transform="rotate(-90 12 12)"
              >
                <animate attributeName="stroke-dashoffset" values="56.5;0" dur="3s" repeatCount="indefinite" />
              </circle>
              {/* Akrep sabit, yelkovan dönüyor */}
              <path d="M12 12V8" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="0 12 12;360 12 12"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </path>
              <path d="M12 12h2.5" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-white">{t.requestSent.title}</p>
            <p className="mt-0.5 truncate text-xs text-[#9ca3af]">
              {title}
              {artist ? ` — ${artist}` : ""}
            </p>
          </div>
        </div>

        {/* Ücret önce: kartın başlıktan sonraki en büyük ve en dikkat çeken
            satırı — müşteri onayın bedava olmadığını burada öğrensin */}
        {tokens !== null && (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-[#e91e8c]/35 bg-[#e91e8c]/[0.1] px-3.5 py-3.5">
            <svg className="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#e91e8c" strokeWidth="2" />
              <path d="M14.5 9.5A3 3 0 1 0 12 15" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="min-w-0 flex-1 text-base font-bold leading-snug text-white">
              {fmt(price ? t.requestSent.costLine : t.requestSent.costLinePlain, {
                n: tokens,
                price: price ?? "",
              })}
            </p>
          </div>
        )}

        {/* Tek satır: şerit kartın hemen altında, ok oraya bakar */}
        {/* Kartın tamamı sarıya döndüğü için bu satır nötr: sarı artık "bekliyor"
            sinyali, ok ise sadece yön gösteriyor */}
        <div className="mt-2.5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5">
          <svg className="shrink-0 animate-bounce" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 4v14M6 13l6 6 6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="min-w-0 flex-1 text-xs font-medium text-[#9ca3af]">{t.requestSent.trackHint}</p>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-2xl py-3 text-sm font-bold text-[#1a1005]"
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
        >
          {t.requestSent.cta}
        </button>
      </div>
    </div>
  );
}
