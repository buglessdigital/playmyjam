import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getVenueBySlug, getVenueTokenPackages } from "@/lib/venue-cache";
import { COMPANY } from "@/lib/company-info";
import Coin from "@/components/ui/Coin";
import CardLogos from "@/components/ui/CardLogos";
import LegalFooter from "@/components/ui/LegalFooter";

export const metadata: Metadata = {
  title: "PlayMyJam — Mekanda müziği sen seç",
  description:
    "PlayMyJam ile mekandaki müzik sırasına şarkı ekle. Jeton satın al, şarkını iste, sıranı takip et.",
};

const DEFAULT_VENUE = "ecem-s-house";

// Paket vitrini: fiyatlar DB'den cache'li gelir (venue-cache "minutes" profili),
// bu yüzden sayfa kabuğu statik kalırken fiyat değişiklikleri birkaç dk içinde yansır.
async function PackagesSection() {
  const venue = await getVenueBySlug(DEFAULT_VENUE);
  const packages = venue ? await getVenueTokenPackages(venue.id) : [];
  if (packages.length === 0) return null;

  const maxUnit = packages.reduce((m, p) => Math.max(m, p.price / p.tokens), 0);

  return (
    <section id="fiyatlar" className="mx-auto w-full max-w-5xl px-6 py-14">
      <h2 className="text-center text-2xl font-black text-white">Jeton Paketleri ve Fiyatlar</h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[#9ca3af]">
        Şarkı istemek için jeton kullanılır. Jetonlar dijital olarak anında hesabına yüklenir ve
        PlayMyJam kullanan tüm mekanlarda geçerlidir. Tüm fiyatlara KDV dahildir.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {packages.map((p, idx) => {
          const savings = maxUnit > 0 ? Math.round((1 - p.price / p.tokens / maxUnit) * 100) : 0;
          const unit = (p.price / p.tokens).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
          return (
            <div
              key={p.id}
              className="relative flex flex-col rounded-2xl p-4"
              style={{
                background: p.popular
                  ? "linear-gradient(160deg, rgba(233,30,140,0.16), rgba(139,92,246,0.08) 60%, #1a0e2a)"
                  : "#1a0e2a",
                border: p.popular
                  ? "1px solid rgba(233,30,140,0.55)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {p.popular && (
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[9px] font-extrabold uppercase tracking-wider text-white"
                  style={{ background: "linear-gradient(135deg, #ff2d9c, #b3126d)" }}
                >
                  En Popüler
                </span>
              )}
              <div className="flex">
                {Array.from({ length: Math.min(idx + 1, 4) }).map((_, i) => (
                  <span key={i} className={`relative inline-flex ${i > 0 ? "-ml-2.5" : ""}`} style={{ zIndex: 4 - i }}>
                    <Coin size={22} />
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[26px] font-black leading-none text-white">
                {p.tokens} <span className="text-xs font-medium text-[#9ca3af]">jeton</span>
              </p>
              <p className="mt-1 text-[11px] text-[#6b7280]">₺{unit}/jeton</p>
              <div className="mt-2 flex items-center justify-between gap-1">
                <p className="text-base font-bold text-[#e91e8c]">{p.price}₺</p>
                {savings > 0 && (
                  <span className="rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-bold text-[#4ade80]">
                    %{savings} avantaj
                  </span>
                )}
              </div>
              <Link
                href={`/venue/${DEFAULT_VENUE}/tokens`}
                className="mt-4 rounded-xl py-2.5 text-center text-sm font-bold text-white transition-transform active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)" }}
              >
                Satın Al
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <CardLogos />
        <p className="flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          256-bit SSL ile güvenli ödeme · Jetonlar anında teslim edilir
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Mekanı Aç",
    desc: "Bulunduğun mekandaki QR kodu okut veya mekan bağlantısını aç.",
  },
  {
    title: "Jeton Satın Al",
    desc: "Sana uygun jeton paketini seç, güvenli ödeme ile hesabına anında yüklensin.",
  },
  {
    title: "Şarkını İste",
    desc: "Katalogdan şarkını seç, jetonunla sıraya ekle ve çalma sırasını canlı takip et.",
  },
];

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#0f0a18]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 0%, rgba(233,30,140,0.16), rgba(139,92,246,0.08) 45%, transparent 75%)",
        }}
      />

      {/* Hero */}
      <section className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-10 pt-20 text-center">
        <div className="mb-5 flex items-center gap-2">
          <Coin size={34} />
          <span className="text-2xl font-black tracking-tight text-white">PlayMyJam</span>
        </div>
        <h1 className="max-w-2xl text-4xl font-black leading-tight text-white sm:text-5xl">
          Mekanda müziği <span className="text-[#e91e8c]">sen</span> seç
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#9ca3af] sm:text-base">
          PlayMyJam, kafe ve eğlence mekanlarında müzik sırasını misafirlere açan dijital şarkı
          istek platformudur. Jeton satın al, şarkını sıraya ekle, çalma anını canlı izle.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/venue/${DEFAULT_VENUE}`}
            className="rounded-2xl px-6 py-3.5 text-base font-bold text-white transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)",
              boxShadow: "0 10px 32px -8px rgba(233,30,140,0.55)",
            }}
          >
            Uygulamayı Aç
          </Link>
          <a
            href="#fiyatlar"
            className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-semibold text-white transition-transform active:scale-[0.98]"
          >
            Fiyatları Gör
          </a>
        </div>
      </section>

      {/* Nasıl çalışır */}
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <h2 className="text-center text-2xl font-black text-white">Nasıl Çalışır?</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-2xl p-5"
              style={{ background: "#160d24", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white"
                style={{ background: "rgba(233,30,140,0.15)", border: "1px solid rgba(233,30,140,0.35)" }}
              >
                {i + 1}
              </span>
              <h3 className="mt-4 text-base font-bold text-white">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#9ca3af]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Paketler — fiyatlar DB'den, kabuk statik */}
      <Suspense fallback={null}>
        <PackagesSection />
      </Suspense>

      {/* İletişim — Tosla şartı: ana sayfada "İletişim" başlığı altında eksiksiz bilgiler */}
      <section id="iletisim" className="mx-auto w-full max-w-5xl px-6 py-14">
        <h2 className="text-center text-2xl font-black text-white">İletişim</h2>
        <div
          className="mx-auto mt-8 max-w-lg rounded-2xl p-6"
          style={{ background: "#160d24", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <dl className="space-y-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                İşletme Sahibi
              </dt>
              <dd className="font-semibold text-white">
                {COMPANY.legalName} — {COMPANY.brand}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                E-posta
              </dt>
              <dd>
                <a href={`mailto:${COMPANY.email}`} className="font-semibold text-[#e91e8c]">
                  {COMPANY.email}
                </a>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                Telefon
              </dt>
              <dd>
                <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="font-semibold text-white">
                  {COMPANY.phone}
                </a>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                Adres
              </dt>
              <dd className="font-semibold text-white">
                {COMPANY.address}, {COMPANY.city}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
