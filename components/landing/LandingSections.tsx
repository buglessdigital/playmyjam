"use client";

import Link from "next/link";
import IyzicoBand from "@/components/ui/IyzicoBand";
import PhoneMockup from "@/components/landing/PhoneMockup";
import VenueApplicationForm from "@/components/landing/VenueApplicationForm";
import { COMPANY } from "@/lib/company-info";
import { fmt, useT } from "@/lib/i18n";

// Ana sayfanın metin taşıyan bölümleri. Sayfanın kendisi sunucu bileşeni olarak
// kalır (fiyatlar cache'li stream edilir); yalnızca bu bölümler istemciye iner ki
// dil değişimi yeniden istek atmadan uygulansın.

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

const LOCK_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const BOLT_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export function HeroSection() {
  const t = useT();

  return (
    <section className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
      <div className="text-center lg:text-left">
        <span
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-[#ff8fd0]"
          style={{ background: "rgba(233,30,140,0.08)", border: "1px solid rgba(233,30,140,0.22)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
            <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
          </svg>
          {t.home.hero.badge}
        </span>
        <h1 className="mt-6 text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[56px]">
          {t.home.hero.titleLead}{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(100deg, #ff2d9c, #b18cff)" }}
          >
            {t.home.hero.titleAccent}
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#9ca3af] sm:text-base lg:mx-0">
          {t.home.hero.sub}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
          <Link
            href="/mekanlar"
            className="rounded-2xl px-7 py-4 text-base font-bold text-white transition-transform active:scale-[0.98]"
            style={{ background: PINK_GRADIENT, boxShadow: "0 12px 36px -10px rgba(233,30,140,0.6)" }}
          >
            {t.home.hero.exploreVenues}
          </Link>
          <a
            href="#fiyatlar"
            className="rounded-2xl border border-white/15 bg-white/5 px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t.home.hero.seePricing}
          </a>
        </div>

        {/* Mekan sahipleri kayıt formunu ilk ekranda görsün */}
        <a
          href="#mekan-basvuru"
          className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[#ff8fd0] transition-colors hover:text-white"
          style={{ background: "rgba(233,30,140,0.08)", border: "1px solid rgba(233,30,140,0.22)" }}
        >
          {t.home.hero.ownerCta}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 lg:justify-start">
          <span className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
            {LOCK_ICON}
            {t.home.hero.sslBadge}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
            {BOLT_ICON}
            {t.home.hero.instantBadge}
          </span>
          <IyzicoBand />
        </div>
      </div>

      <PhoneMockup />
    </section>
  );
}

export function ValuePropsSection() {
  const t = useT();

  const items = [
    {
      title: t.home.value.instantTitle,
      desc: t.home.value.instantDesc,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#e91e8c" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: t.home.value.walletTitle,
      desc: t.home.value.walletDesc,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="6" width="20" height="14" rx="3" stroke="#e91e8c" strokeWidth="2" />
          <path d="M2 10h20M16 15h2" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: t.home.value.secureTitle,
      desc: t.home.value.secureDesc,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" stroke="#e91e8c" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 12l2 2 4-4" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((v) => (
          <div
            key={v.title}
            className="flex items-start gap-4 rounded-2xl border border-white/[0.07] p-5"
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.25)" }}
            >
              {v.icon}
            </span>
            <div>
              <p className="text-sm font-bold text-white">{v.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#9ca3af]">{v.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  const t = useT();

  const steps = [
    { title: t.home.steps.openTitle, desc: t.home.steps.openDesc },
    { title: t.home.steps.buyTitle, desc: t.home.steps.buyDesc },
    { title: t.home.steps.requestTitle, desc: t.home.steps.requestDesc },
  ];

  return (
    <section id="nasil-calisir" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.nav.howItWorks}</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">{t.home.steps.heading}</h2>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className="relative rounded-2xl border border-white/[0.07] p-6"
            style={{ background: "#160d24" }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl text-base font-black text-white"
              style={{ background: PINK_GRADIENT, boxShadow: "0 8px 20px -6px rgba(233,30,140,0.5)" }}
            >
              {i + 1}
            </span>
            <h3 className="mt-5 text-lg font-bold text-white">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ForVenuesSection() {
  const t = useT();

  const features = [
    { title: t.home.venues.queueTitle, desc: t.home.venues.queueDesc },
    { title: t.home.venues.hardwareTitle, desc: t.home.venues.hardwareDesc },
    { title: t.home.venues.statsTitle, desc: t.home.venues.statsDesc },
    { title: t.home.venues.guestTitle, desc: t.home.venues.guestDesc },
  ];

  return (
    <section id="mekanlar" className="scroll-mt-24 border-y border-white/[0.06] py-20" style={{ background: "#120b1e" }}>
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.nav.forVenues}</p>
          <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
            {t.home.venues.headingLine1}
            <br />
            {t.home.venues.headingLine2}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9ca3af] sm:text-base">
            {t.home.venues.desc}
          </p>
          <a
            href="#mekan-basvuru"
            className="mt-7 inline-block rounded-2xl px-6 py-3.5 text-sm font-bold text-white transition-transform active:scale-[0.98]"
            style={{ background: PINK_GRADIENT, boxShadow: "0 10px 28px -10px rgba(233,30,140,0.6)" }}
          >
            {t.home.venues.cta}
          </a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/[0.07] p-5"
              style={{ background: "#160d24" }}
            >
              <p className="text-sm font-bold text-white">{f.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[#9ca3af]">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Mekan kayıt formu — talepler super admin panelindeki "Mekan Talepleri"ne düşer
export function VenueApplicationSection() {
  const t = useT();

  return (
    <section id="mekan-basvuru" className="mx-auto w-full max-w-3xl scroll-mt-24 px-5 py-20">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.home.apply.eyebrow}</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">{t.home.apply.heading}</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#9ca3af] sm:text-base">
          {t.home.apply.desc}
        </p>
      </div>

      <div className="mt-10">
        <VenueApplicationForm />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[#6b7280]">
        <span>{t.home.apply.directContact}</span>
        <a href={`mailto:${COMPANY.email}`} className="text-[#9ca3af] hover:text-white">
          {COMPANY.email}
        </a>
        <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="text-[#9ca3af] hover:text-white">
          {COMPANY.phone}
        </a>
      </div>
    </section>
  );
}

export function FaqSection() {
  const t = useT();

  const faqs = [
    { q: t.home.faq.q1, a: t.home.faq.a1 },
    { q: t.home.faq.q2, a: t.home.faq.a2 },
    { q: t.home.faq.q3, a: t.home.faq.a3 },
    { q: t.home.faq.q4, a: t.home.faq.a4 },
    { q: t.home.faq.q5, a: t.home.faq.a5 },
    { q: t.home.faq.q6, a: t.home.faq.a6 },
  ];

  return (
    <section id="sss" className="mx-auto w-full max-w-3xl scroll-mt-24 px-5 py-20">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.nav.faq}</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">{t.home.faq.heading}</h2>
      </div>
      <div className="mt-10 space-y-3">
        {faqs.map((f) => (
          <details
            key={f.q}
            className="faq-item group rounded-2xl border border-white/[0.08] transition-colors open:border-[#e91e8c]/30"
            style={{ background: "#160d24" }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <span className="text-sm font-bold text-white sm:text-[15px]">{f.q}</span>
              <svg
                className="faq-chevron shrink-0 transition-transform"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-[#9ca3af]">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// Ödeme kuruluşu şartı: ana sayfada "İletişim" başlığı altında eksiksiz bilgiler
export function ContactSection() {
  const t = useT();

  return (
    <section id="iletisim" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 pb-24 pt-4">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.nav.contact}</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">{t.home.contact.heading}</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#9ca3af]">
          {t.home.contact.desc}
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
        <a
          href={`mailto:${COMPANY.email}`}
          className="rounded-2xl border border-white/[0.07] p-5 text-center transition-colors hover:border-[#e91e8c]/40"
          style={{ background: "#160d24" }}
        >
          <span
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.25)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" stroke="#e91e8c" strokeWidth="2" />
              <path d="M2 7l10 7L22 7" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#9ca3af]">{t.home.contact.email}</p>
          <p className="mt-1 break-all text-sm font-semibold text-white">{COMPANY.email}</p>
        </a>
        <a
          href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}
          className="rounded-2xl border border-white/[0.07] p-5 text-center transition-colors hover:border-[#e91e8c]/40"
          style={{ background: "#160d24" }}
        >
          <span
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.25)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2z"
                stroke="#e91e8c"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#9ca3af]">{t.home.contact.phone}</p>
          <p className="mt-1 text-sm font-semibold text-white">{COMPANY.phone}</p>
        </a>
        <div className="rounded-2xl border border-white/[0.07] p-5 text-center" style={{ background: "#160d24" }}>
          <span
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.25)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0z" stroke="#e91e8c" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="10" r="3" stroke="#e91e8c" strokeWidth="2" />
            </svg>
          </span>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#9ca3af]">{t.home.contact.address}</p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-white">{COMPANY.address}</p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-[#6b7280]">
        {fmt(t.home.contact.operator, { legalName: COMPANY.legalName, brand: COMPANY.brand })}
      </p>
    </section>
  );
}
