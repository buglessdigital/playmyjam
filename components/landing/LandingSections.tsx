"use client";

import Link from "next/link";
import Coin from "@/components/ui/Coin";
import SoundBackdrop from "@/components/landing/SoundBackdrop";
import { COMPANY } from "@/lib/company-info";
import { fmt, useT } from "@/lib/i18n";
import { useNativePlatform } from "@/lib/native-app";

// Ana sayfanın metin taşıyan bölümleri. Sayfanın kendisi sunucu bileşeni olarak
// kalır (fiyatlar cache'li stream edilir); yalnızca bu bölümler istemciye iner ki
// dil değişimi yeniden istek atmadan uygulansın.
//
// Görsel dil: kulüp afişi / plak kapağı. Degrade yazı, parlayan rozet ve
// ikon-kutulu kart ızgarası bilinçli olarak yok; vurgu düz pembe + büyük tipografi.

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff2d9c]";

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Örnek sıra — tanınmış şarkılar, gerçek bir mekanın verisi değil
const DEMO_QUEUE = [
  { title: "Billie Jean", artist: "Michael Jackson", priority: true },
  { title: "Hotel California", artist: "Eagles", priority: false },
  { title: "Sweet Child O' Mine", artist: "Guns N' Roses", priority: false },
];

export function HeroSection() {
  const t = useT();
  const inApp = useNativePlatform() !== null;

  return (
    <section className="relative isolate overflow-hidden border-b border-white/[0.06]">
      <SoundBackdrop className="absolute inset-0 -z-10 h-full w-full" />
      {/* Yazının okunduğu sol tarafı koyulaştır, analizör sağda daha canlı kalsın */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, rgba(15,10,24,0.92) 0%, rgba(15,10,24,0.7) 45%, rgba(15,10,24,0.2) 100%)",
        }}
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-28 pt-14 sm:px-6 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[1.15fr_0.85fr] lg:pb-36 lg:pt-10">
        <div>
          <p className="font-tag text-xs uppercase tracking-[0.18em] text-[#c7cad1]">{t.home.hero.kicker}</p>
          <h1 className="font-display mt-5 text-[56px] font-extrabold leading-[0.92] tracking-[-0.03em] text-white sm:text-[80px] lg:text-[104px]">
            {t.home.hero.titleLine1}
            <br />
            <span className="text-[#ff2d9c]">{t.home.hero.titleLine2}</span>
          </h1>
          <p className="mt-7 max-w-lg text-base leading-relaxed text-[#d1d5db] sm:text-lg">{t.home.hero.sub}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/mekanlar"
              className={`inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#e91e8c] px-8 text-base font-bold text-white transition-colors hover:bg-[#ff2d9c] ${FOCUS_RING}`}
            >
              {t.home.hero.findVenue}
              {ARROW}
            </Link>
            {!inApp && (
              <Link
                href="/mekan-kayit"
                className={`inline-flex min-h-14 items-center justify-center rounded-full border-2 border-white/25 px-8 text-base font-bold text-white transition-colors hover:border-white hover:bg-white hover:text-[#0f0a18] ${FOCUS_RING}`}
              >
                {t.home.hero.ownerCta}
              </Link>
            )}
          </div>

          <p className="mt-6 flex max-w-md items-start gap-2.5 text-sm text-[#9ca3af]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 shrink-0">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {t.home.hero.hint}
          </p>
        </div>

        <TurntableArt />
      </div>
    </section>
  );
}

// Sağdaki görsel: dönen plak + üstüne bırakılmış kağıt setlist. Telefon
// mockup'ı yerine — her SaaS sayfasında olan şey değil, müziğin kendisi.
function TurntableArt() {
  const t = useT();

  return (
    <div aria-hidden className="relative mx-auto hidden h-[520px] w-full max-w-[520px] lg:block">
      <div className="vinyl vinyl-spin absolute right-0 top-0 h-[440px] w-[440px] rounded-full">
        {/* Etiketin ortasında jetonumuz — plakla birlikte döner */}
        <div className="absolute inset-[34%] flex items-center justify-center rounded-full bg-[#c2126f] shadow-[inset_0_0_0_6px_rgba(0,0,0,0.12)]">
          <Coin size={104} />
        </div>
      </div>

      {/* Pikap kolu */}
      <svg className="absolute right-[-18px] top-[-10px]" width="140" height="300" viewBox="0 0 140 300" fill="none">
        <circle cx="110" cy="30" r="22" fill="#1f1a28" stroke="#3a3346" strokeWidth="2" />
        <circle cx="110" cy="30" r="7" fill="#6b6478" />
        <path d="M110 30 L 96 220 L 70 262" stroke="#b9b3c4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="52" y="252" width="30" height="20" rx="3" transform="rotate(-35 67 262)" fill="#d9d4e0" />
      </svg>

      {/* Kağıt setlist */}
      <div className="absolute bottom-0 left-0 w-[300px] -rotate-[4deg] text-[#1a1420] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="ticket-edge h-2 bg-[#f3eee4]" />
        <div className="bg-[#f3eee4] px-5 pb-5 pt-3">
          <p className="font-tag text-[10px] uppercase tracking-[0.2em] text-[#7a6f86]">{t.home.hero.deckLabel}</p>
          <div className="mt-3 flex items-center justify-between gap-3 border-b border-dashed border-[#1a1420]/25 pb-3">
            <div className="min-w-0">
              <p className="font-tag text-[10px] uppercase tracking-[0.14em] text-[#c2126f]">{t.home.hero.nowPlaying}</p>
              <p className="font-display truncate text-lg font-bold leading-tight">Bohemian Rhapsody</p>
              <p className="text-xs text-[#5b5266]">Queen</p>
            </div>
            <span className="flex h-6 items-end gap-[3px]">
              {[0, 0.2, 0.4, 0.1].map((d) => (
                <span key={d} className="eq-bar w-[3px] rounded-sm bg-[#c2126f]" style={{ height: "100%", animationDelay: `${d}s` }} />
              ))}
            </span>
          </div>
          <ol className="mt-3 space-y-2.5">
            {DEMO_QUEUE.map((s, i) => (
              <li key={s.title} className="flex items-baseline gap-3">
                <span className="font-tag w-4 text-xs text-[#7a6f86]">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block truncate text-[11px] text-[#5b5266]">{s.artist}</span>
                </span>
                {s.priority && (
                  <span className="font-tag rounded-sm bg-[#1a1420] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#f3eee4]">
                    {t.home.hero.priority}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// İki kapı: misafir ve mekan sahibi aynı ekranda kendi yolunu bulsun.
// id'ler eski bağlantılar (/#mekanlar, /#mekan-basvuru) kırılmasın diye burada.
export function AudienceSection() {
  const t = useT();
  const inApp = useNativePlatform() !== null;

  const guest = [t.home.doors.guest1, t.home.doors.guest2, t.home.doors.guest3];
  const venue = [t.home.doors.venue1, t.home.doors.venue2, t.home.doors.venue3];

  return (
    <section id="mekanlar" aria-label={`${t.home.doors.guestLabel} / ${t.home.doors.venueLabel}`} className="scroll-mt-24">
      <div className={`grid ${inApp ? "" : "lg:grid-cols-2"}`}>
        <div className="border-b border-white/[0.06] px-5 py-16 sm:px-10 lg:px-14 lg:py-20">
          <div className={`mx-auto max-w-xl ${inApp ? "" : "lg:ml-auto lg:mr-0"}`}>
            <p className="font-tag text-xs uppercase tracking-[0.18em] text-[#ff8fd0]">{t.home.doors.guestLabel}</p>
            <h2 className="font-display mt-4 text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl">
              {t.home.doors.guestTitle}
            </h2>
            <ul className="mt-8 space-y-4">
              {guest.map((line) => (
                <li key={line} className="flex gap-4 text-base leading-relaxed text-[#d1d5db]">
                  <span aria-hidden className="mt-3 h-px w-5 shrink-0 bg-[#ff2d9c]" />
                  {line}
                </li>
              ))}
            </ul>
            <Link
              href="/mekanlar"
              className={`mt-10 inline-flex min-h-12 items-center gap-3 rounded-full bg-white px-7 text-base font-bold text-[#0f0a18] transition-colors hover:bg-[#ffd6ec] ${FOCUS_RING}`}
            >
              {t.home.doors.guestCta}
              {ARROW}
            </Link>
          </div>
        </div>

        {!inApp && (
          <div id="mekan-basvuru" className="scroll-mt-24 bg-[#c2126f] px-5 py-16 sm:px-10 lg:px-14 lg:py-20">
            <div className="mx-auto max-w-xl lg:ml-0">
              <p className="font-tag text-xs uppercase tracking-[0.18em] text-white/80">{t.home.doors.venueLabel}</p>
              <h2 className="font-display mt-4 text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl">
                {t.home.doors.venueTitle}
              </h2>
              <ul className="mt-8 space-y-4">
                {venue.map((line) => (
                  <li key={line} className="flex gap-4 text-base leading-relaxed text-white">
                    <span aria-hidden className="mt-3 h-px w-5 shrink-0 bg-white" />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/mekan-kayit"
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#0f0a18] px-7 text-base font-bold text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  {t.home.doors.venueCta}
                  {ARROW}
                </Link>
                <Link
                  href="/mekan-girisi"
                  className="inline-flex min-h-12 items-center text-base font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  {t.home.doors.venueLogin}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Adımlar bir plak arka kapağındaki parça listesi gibi: A1, A2, B1, B2.
export function HowItWorksSection() {
  const t = useT();

  const steps = [
    { side: "A1", title: t.home.steps.scanTitle, desc: t.home.steps.scanDesc },
    { side: "A2", title: t.home.steps.pickTitle, desc: t.home.steps.pickDesc },
    { side: "B1", title: t.home.steps.payTitle, desc: t.home.steps.payDesc },
    { side: "B2", title: t.home.steps.listenTitle, desc: t.home.steps.listenDesc },
  ];

  return (
    <section id="nasil-calisir" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-6 lg:py-28">
      <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
        {t.home.steps.heading}
      </h2>
      <ol className="mt-12 border-t border-white/15">
        {steps.map((s) => (
          <li
            key={s.side}
            className="grid gap-2 border-b border-white/15 py-7 sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-baseline sm:gap-8"
          >
            <span className="font-tag text-sm text-[#ff8fd0]">{s.side}</span>
            <h3 className="font-display text-2xl font-bold text-white sm:text-3xl">{s.title}</h3>
            <p className="text-base leading-relaxed text-[#9ca3af]">{s.desc}</p>
          </li>
        ))}
      </ol>
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
    <section id="sss" className="scroll-mt-24 border-t border-white/[0.06]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          {t.home.faq.heading}
        </h2>
        <div className="border-t border-white/15">
          {faqs.map((f) => (
            <details key={f.q} className="faq-item group border-b border-white/15">
              <summary
                className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 ${FOCUS_RING} focus-visible:outline-offset-0`}
              >
                <span className="text-base font-semibold text-white sm:text-lg">{f.q}</span>
                <span
                  aria-hidden
                  className="faq-chevron font-tag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-lg leading-none text-white transition-transform"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-6 text-base leading-relaxed text-[#9ca3af]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// Ödeme kuruluşu şartı: ana sayfada "İletişim" başlığı altında eksiksiz bilgiler
export function ContactSection() {
  const t = useT();

  const rows = [
    { label: t.home.contact.email, value: COMPANY.email, href: `mailto:${COMPANY.email}` },
    { label: t.home.contact.phone, value: COMPANY.phone, href: `tel:${COMPANY.phone.replace(/\s/g, "")}` },
    { label: t.home.contact.address, value: COMPANY.address, href: null },
  ];

  return (
    <section id="iletisim" className="scroll-mt-24 border-t border-white/[0.06]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
        <div>
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {t.home.contact.heading}
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-[#9ca3af]">{t.home.contact.desc}</p>
        </div>
        <div>
          <dl className="border-t border-white/15">
            {rows.map((r) => (
              <div key={r.label} className="grid gap-1 border-b border-white/15 py-5 sm:grid-cols-[140px_1fr] sm:gap-6">
                <dt className="font-tag text-xs uppercase tracking-[0.16em] text-[#9ca3af] sm:pt-1">{r.label}</dt>
                <dd className="text-lg font-semibold text-white">
                  {r.href ? (
                    <a href={r.href} className={`break-all underline decoration-white/25 underline-offset-4 hover:decoration-[#ff2d9c] ${FOCUS_RING}`}>
                      {r.value}
                    </a>
                  ) : (
                    r.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm text-[#6b7280]">
            {fmt(t.home.contact.operator, { legalName: COMPANY.legalName, brand: COMPANY.brand })}
          </p>
        </div>
      </div>
    </section>
  );
}
