"use client";

import Link from "next/link";
import Coin from "@/components/ui/Coin";
import IyzicoBand from "@/components/ui/IyzicoBand";
import type { TokenPackage } from "@/lib/pricing-cache";
import { fmt, useI18n } from "@/lib/i18n";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

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
    <section id="fiyatlar" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.home.pricing.eyebrow}</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">{t.home.pricing.heading}</h2>
        <p className="mt-4 text-sm leading-relaxed text-[#9ca3af] sm:text-base">{t.home.pricing.desc}</p>
        <div
          className="mx-auto mt-6 flex max-w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-3xl px-5 py-2.5"
          style={{ background: "rgba(233,30,140,0.08)", border: "1px solid rgba(233,30,140,0.25)", width: "fit-content" }}
        >
          <Coin size={20} />
          <span className="text-sm font-bold text-white">
            {fmt(t.home.pricing.unit, { price: num(unitPrice) })}
          </span>
          <span className="text-xs text-[#9ca3af]">{t.home.pricing.unitNote}</span>
        </div>
      </div>

      {packages.length > 0 && (
        <div className="mt-12 grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
          {packages.map((p) => {
            const savings = unitPrice > 0 ? Math.round((1 - p.price / p.tokens / unitPrice) * 100) : 0;
            return (
              <div
                key={p.id}
                className="relative flex flex-col rounded-2xl p-5"
                style={{
                  background: p.popular
                    ? "linear-gradient(160deg, rgba(233,30,140,0.16), rgba(139,92,246,0.08) 60%, #1a0e2a)"
                    : "#160d24",
                  border: p.popular ? "1px solid rgba(233,30,140,0.55)" : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: p.popular ? "0 0 40px rgba(233,30,140,0.15)" : "none",
                }}
              >
                {p.popular && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white"
                    style={{ background: PINK_GRADIENT, boxShadow: "0 4px 14px rgba(233,30,140,0.45)" }}
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
                      ? { background: PINK_GRADIENT, boxShadow: "0 8px 24px -8px rgba(233,30,140,0.55)" }
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

      <div className="mt-10 flex flex-col items-center gap-3.5">
        <IyzicoBand />
        <p className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          {t.home.pricing.sslNote}
        </p>
        <p className="max-w-lg text-center text-[11px] leading-relaxed text-[#6b7280]">
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
    </section>
  );
}
