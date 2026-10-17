"use client";

import { useState } from "react";
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

// Hakkımızda + telif güvencesi. Telif bandındaki her iddia mekan sözleşmesinin
// Ek-2'sindeki (lib/contract-template.ts, musicUndertaking) bir maddeye dayanır;
// madde numaraları orada değişirse sözlükteki "c*Proof" metinleri de güncellenmeli.
// Bilinçli olarak sade: çalma altyapısı (hangi oynatıcı/kaynak) burada anlatılmaz.
export function AboutSection() {
  const t = useT();
  const a = t.home.about;

  const claims = [
    { n: "01", title: a.c1Title, proof: a.c1Proof },
    { n: "02", title: a.c2Title, proof: a.c2Proof },
    { n: "03", title: a.c3Title, proof: a.c3Proof },
  ];

  return (
    <section id="hakkimizda" className="scroll-mt-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-28">
        {/* Marka jetonu: hero'daki plağın etiketindeki jetonun sakin hali */}
        <div aria-hidden className="mx-auto flex w-full max-w-[200px] justify-center sm:max-w-[260px] lg:max-w-[340px]">
          <div className="w-full drop-shadow-[0_30px_60px_rgba(233,30,140,0.25)] [&>svg]:h-auto [&>svg]:w-full">
            <Coin size={340} />
          </div>
        </div>

        <div className="mx-auto max-w-2xl lg:mx-0">
          <p className="font-tag text-xs uppercase tracking-[0.18em] text-[#ff8fd0]">{a.kicker}</p>
          <h2 className="font-display mt-4 text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl">
            {a.title}
          </h2>
          <p className="mt-8 text-base leading-relaxed text-[#d1d5db] sm:text-lg">{a.p1}</p>
          <p className="mt-5 text-base leading-relaxed text-[#9ca3af] sm:text-lg">{a.p2}</p>
        </div>
      </div>

      {/* Telif güvencesi: mekanizma anlatılmaz, yalnız sonuç + sözleşme maddesi.
          "Nasıl çalışır" listesiyle aynı dil: ikon/kart yok, çizgi + tipografi.
          Zemin bilerek koyu: hemen altındaki "Mekan sahibiysen" bloğu pembe. */}
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-28">
          <div>
            <p className="font-tag text-xs uppercase tracking-[0.18em] text-[#ff8fd0]">{a.copyrightKicker}</p>
            <h3 className="font-display mt-4 text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl">
              {a.copyrightTitle}
            </h3>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-[#9ca3af]">{a.copyrightLead}</p>
          </div>
          <ol className="border-t border-white/15">
            {claims.map((c) => (
              <li
                key={c.n}
                className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-white/15 py-7 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-6"
              >
                <span className="font-tag text-sm text-[#ff8fd0]">{c.n}</span>
                <p className="font-display text-2xl font-bold leading-snug text-white sm:text-[28px]">{c.title}</p>
                <span className="font-tag col-start-2 text-[11px] uppercase tracking-[0.14em] text-[#6b7280] sm:col-start-3 sm:text-right">
                  {a.proofLabel} {c.proof}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
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

// İki kitle, iki liste: misafir ve mekan sahibi kendi sorularını ayrı görür.
// Kapalı sekme ve kapalı cevaplar DOM'da kalır (hidden / 0fr): arama motoru ve
// sayfa içi arama hepsini bulur. Aynı anda tek cevap açık.
export function FaqSection() {
  const t = useT();
  const f = t.home.faq;
  const [tab, setTab] = useState<"guest" | "venue">("guest");
  const [open, setOpen] = useState(0);

  const lists = {
    guest: [
      { q: f.g1q, a: f.g1a },
      { q: f.g2q, a: f.g2a },
      { q: f.g3q, a: f.g3a },
      { q: f.g4q, a: f.g4a },
      { q: f.g5q, a: f.g5a },
      { q: f.g6q, a: f.g6a },
      { q: f.g7q, a: f.g7a },
    ],
    venue: [
      { q: f.v1q, a: f.v1a },
      { q: f.v2q, a: f.v2a },
      { q: f.v3q, a: f.v3a },
      { q: f.v4q, a: f.v4a },
      { q: f.v5q, a: f.v5a },
      { q: f.v6q, a: f.v6a },
    ],
  };
  const tabs = [
    { key: "guest" as const, label: f.guestTab },
    { key: "venue" as const, label: f.venueTab },
  ];

  return (
    <section id="sss" className="scroll-mt-24 border-t border-white/[0.06]">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-28">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{f.heading}</h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-[#9ca3af]">{f.sub}</p>

          <div role="tablist" aria-label={f.heading} className="mt-8 inline-flex rounded-full border border-white/15 p-1">
            {tabs.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={tab === x.key}
                aria-controls={`sss-${x.key}`}
                onClick={() => {
                  setTab(x.key);
                  setOpen(0);
                }}
                className={`min-h-11 rounded-full px-6 text-sm font-bold transition-colors ${FOCUS_RING} focus-visible:outline-offset-2 ${
                  tab === x.key ? "bg-white text-[#0f0a18]" : "text-white/70 hover:text-white"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>

          <p className="mt-10 hidden text-sm text-[#9ca3af] lg:block">
            {f.more}{" "}
            <a href="#iletisim" className={`font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-[#ff2d9c] ${FOCUS_RING}`}>
              {f.moreCta}
            </a>
          </p>
        </div>

        <div>
          {tabs.map((x) => (
            <ol key={x.key} id={`sss-${x.key}`} role="tabpanel" hidden={tab !== x.key} className="hiw-fade border-t border-white/15">
              {lists[x.key].map((item, i) => {
                const on = tab === x.key && open === i;
                return (
                  <li key={item.q} className="border-b border-white/15">
                    <h3>
                      <button
                        type="button"
                        aria-expanded={on}
                        onClick={() => setOpen(on ? -1 : i)}
                        className={`group grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-3 py-6 text-left sm:grid-cols-[52px_minmax(0,1fr)_auto] ${FOCUS_RING} focus-visible:outline-offset-0`}
                      >
                        <span className={`font-tag pt-1 text-sm transition-colors ${on ? "text-[#ff8fd0]" : "text-white/30"}`}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className={`text-lg font-semibold leading-snug transition-colors sm:text-xl ${on ? "text-white" : "text-white/80 group-hover:text-white"}`}>
                          {item.q}
                        </span>
                        <span
                          aria-hidden
                          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-[transform,background-color,border-color] duration-300 ${
                            on ? "rotate-45 border-[#ff2d9c] bg-[#ff2d9c] text-white" : "border-white/20 text-white group-hover:border-white/50"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </span>
                      </button>
                    </h3>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <div className="overflow-hidden">
                        <p className="max-w-2xl pb-7 pl-[52px] text-base sm:pr-12 leading-relaxed text-[#9ca3af] sm:pl-[64px]">{item.a}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ))}

          <p className="mt-8 text-sm text-[#9ca3af] lg:hidden">
            {f.more}{" "}
            <a href="#iletisim" className={`font-semibold text-white underline decoration-white/30 underline-offset-4 ${FOCUS_RING}`}>
              {f.moreCta}
            </a>
          </p>
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
