"use client";

import Link from "next/link";
import Coin from "@/components/ui/Coin";
import IyzicoBand from "@/components/ui/IyzicoBand";
import type { TokenPackage } from "@/lib/pricing-cache";
import { fmt, useI18n } from "@/lib/i18n";

// Fiyatlar sunucuda cache'li çekilir ("global-pricing" tag'i); burada yalnızca
// sunum yapılır, böylece sayfa kabuğu statik kalırken dil anında değişebilir.
// Paket adı (label) mekan/DB kaynaklı dinamik içerik — çevrilmez.
export default function PricingSection({
  packages,
  unitPrice,
}: {
  packages: TokenPackage[];
  unitPrice: number;
}) {
  const { lang, t } = useI18n();
  const num = (n: number) =>
    n.toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: 2 });

  return (
    <section id="fiyatlar" className="scroll-mt-24 border-t border-white/[0.06]">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{t.home.pricing.heading}</h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#9ca3af]">{t.home.pricing.desc}</p>
        </div>
        {/* Tek fiyat: büyük yazılır, rozet/ışıma yok */}
        <div className="border-l-2 border-[#e91e8c] pl-6">
          <p className="flex items-center gap-3">
            <Coin size={28} />
            <span className="font-display text-4xl font-extrabold text-white sm:text-5xl">
              {fmt(t.home.pricing.unit, { price: num(unitPrice) })}
            </span>
          </p>
          <p className="mt-2 text-sm text-[#9ca3af]">{t.home.pricing.unitNote}</p>
        </div>
      </div>

      <CostNotice />

      {packages.length > 0 && (
        <div
          className={`mt-12 grid grid-cols-2 gap-3.5 sm:gap-4 ${
            // 1-2 paket dar ve ortalanmış durur; 3+ pakette geniş ızgaraya açılır
            packages.length <= 2 ? "mx-auto max-w-xl" : "lg:grid-cols-4"
          }`}
        >
          {packages.map((p) => {
            const savings = unitPrice > 0 ? Math.round((1 - p.price / p.tokens / unitPrice) * 100) : 0;
            return (
              <div
                key={p.id}
                className="relative flex flex-col rounded-2xl p-5"
                style={{
                  background: "#160d24",
                  border: p.popular ? "2px solid #e91e8c" : "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {p.popular && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white"
                    style={{ background: "#e91e8c" }}
                  >
                    {t.home.pricing.mostPopular}
                  </span>
                )}
                <p className="text-sm font-bold text-[#9ca3af]">{p.label}</p>
                <p className="mt-3 text-[32px] font-black leading-none text-white">
                  {p.tokens}
                  <span className="ml-1.5 text-sm font-medium text-[#9ca3af]">{t.home.pricing.tokens}</span>
                </p>
                <p className="mt-1.5 text-xs text-[#6b7280]">
                  {fmt(t.home.pricing.perToken, { price: num(p.price / p.tokens) })}
                </p>
                <div className="mt-4 flex items-baseline justify-between gap-1">
                  <p className="text-xl font-extrabold text-[#e91e8c]">{num(p.price)}₺</p>
                  {savings > 0 && (
                    <span className="rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-bold text-[#4ade80]">
                      {fmt(t.home.pricing.savings, { percent: savings })}
                    </span>
                  )}
                </div>
                <Link
                  href="/mekanlar"
                  className="mt-5 rounded-xl py-2.5 text-center text-sm font-bold text-white transition-transform active:scale-[0.97]"
                  style={
                    p.popular
                      ? { background: "#e91e8c" }
                      : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }
                  }
                >
                  {t.home.pricing.buy}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-12 flex flex-col items-start gap-3.5 border-t border-white/15 pt-8">
        <IyzicoBand />
        <p className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          {t.home.pricing.sslNote}
        </p>
        <p className="max-w-xl text-xs leading-relaxed text-[#9ca3af]">
          {t.home.pricing.legalPrefix}{" "}
          <Link href="/mesafeli-satis-sozlesmesi" className="underline hover:text-[#9ca3af]">
            {t.footer.distanceSales}
          </Link>{" "}
          {t.home.pricing.legalMiddle}{" "}
          <Link href="/teslimat-iade" className="underline hover:text-[#9ca3af]">
            {t.home.pricing.legalDeliveryTerms}
          </Link>
          {t.home.pricing.legalSuffix}
        </p>
      </div>
      </div>
    </section>
  );
}

// Uyarı: jetonun fiyatı sabit ama şarkı başına jeton adedi mekana göre değişir
// (normal = mekanın sabit ücreti; öncelikli = taban + sıra uzadıkça artış, bkz.
// lib/pricing.ts). Ana sayfadaki kağıt setlist diliyle: delikli kenarlı krem not.
function CostNotice() {
  const { t } = useI18n();

  const rows = [
    { title: t.home.pricing.noticeNormalTitle, desc: t.home.pricing.noticeNormalDesc, rising: false },
    { title: t.home.pricing.noticePriorityTitle, desc: t.home.pricing.noticePriorityDesc, rising: true },
  ];

  return (
    <aside
      aria-labelledby="cost-notice-title"
      className="relative mt-12 text-[#1a1420] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] lg:-rotate-[0.6deg]"
    >
      <div className="ticket-edge h-2 bg-[#f3eee4]" />
      <div className="grid gap-8 bg-[#f3eee4] px-6 pb-7 pt-5 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
        <div>
          <p className="font-tag flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#c2126f]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            {t.home.pricing.noticeLabel}
          </p>
          <h3 id="cost-notice-title" className="font-display mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
            {t.home.pricing.noticeTitle}
          </h3>
          <p className="mt-3 max-w-md text-base leading-relaxed text-[#4a4155]">{t.home.pricing.noticeDesc}</p>
        </div>

        <div className="flex flex-col justify-center">
          <ul className="border-t border-dashed border-[#1a1420]/25">
            {rows.map((r) => (
              <li key={r.title} className="flex items-center gap-4 border-b border-dashed border-[#1a1420]/25 py-4">
                {/* Normal: tek jeton. Öncelikli: üst üste jetonlar + yukarı ok (artabilir) */}
                <span aria-hidden className="flex w-20 shrink-0 items-center">
                  <Coin size={30} />
                  {r.rising && (
                    <>
                      <span className="-ml-4"><Coin size={30} /></span>
                      <span className="-ml-4"><Coin size={30} /></span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="ml-1 text-[#c2126f]">
                        <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold">{r.title}</span>
                  <span className="block text-sm leading-snug text-[#4a4155]">{r.desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-[#1a1420]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 shrink-0 text-[#c2126f]">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.home.pricing.noticeConfirm}
          </p>
        </div>
      </div>
    </aside>
  );
}
