import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getGlobalTokenPackages, getTokenUnitPrice } from "@/lib/pricing-cache";
import { COMPANY } from "@/lib/company-info";
import Coin from "@/components/ui/Coin";
import CardLogos from "@/components/ui/CardLogos";

export const metadata: Metadata = {
  title: "PlayMyJam — Mekanda müziği sen seç",
  description:
    "PlayMyJam, kafe ve eğlence mekanlarında müzik sırasını misafirlere açan dijital şarkı istek platformudur. Jeton satın al, şarkını sıraya ekle, çalma anını canlı takip et.",
};

const DEFAULT_VENUE = "ecem-s-house";
const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

/* ---------------------------------- Header --------------------------------- */

function Header() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/[0.06]"
      style={{ background: "rgba(15,10,24,0.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <a href="#top" className="flex items-center gap-2.5">
          <Coin size={26} />
          <span className="text-lg font-black tracking-tight text-white">PlayMyJam</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm font-medium text-[#9ca3af] md:flex">
          <a href="#nasil-calisir" className="transition-colors hover:text-white">Nasıl Çalışır</a>
          <a href="#mekanlar" className="transition-colors hover:text-white">Mekanlar İçin</a>
          <a href="#fiyatlar" className="transition-colors hover:text-white">Fiyatlar</a>
          <a href="#sss" className="transition-colors hover:text-white">SSS</a>
          <a href="#iletisim" className="transition-colors hover:text-white">İletişim</a>
        </nav>
        <Link
          href={`/venue/${DEFAULT_VENUE}`}
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.97]"
          style={{ background: PINK_GRADIENT, boxShadow: "0 6px 20px -6px rgba(233,30,140,0.5)" }}
        >
          Uygulamayı Aç
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------ Telefon mockup ----------------------------- */

const MOCK_QUEUE = [
  { pos: 1, title: "Billie Jean", artist: "Michael Jackson", priority: true },
  { pos: 2, title: "Hotel California", artist: "Eagles", priority: false },
  { pos: 3, title: "Sweet Child O' Mine", artist: "Guns N' Roses", priority: false },
];

function PhoneMockup() {
  return (
    <div aria-hidden className="relative mx-auto w-[290px] select-none">
      <div
        aria-hidden
        className="absolute -inset-10 rounded-full"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(233,30,140,0.22), transparent 70%)" }}
      />
      <div
        className="relative overflow-hidden rounded-[2.6rem] border border-white/10 p-2.5"
        style={{ background: "#05030a", boxShadow: "0 40px 80px -24px rgba(0,0,0,0.8), 0 0 50px rgba(233,30,140,0.12)" }}
      >
        <div className="overflow-hidden rounded-[2rem]" style={{ background: "#120b1e" }}>
          {/* Çentik */}
          <div className="flex justify-center pt-2.5">
            <div className="h-5 w-24 rounded-full bg-black" />
          </div>

          <div className="px-4 pb-5 pt-3">
            {/* Mekan başlığı */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">Mekan</p>
                <p className="text-sm font-extrabold text-white">Kovan Lounge</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-[#22c55e]/10 px-2.5 py-1 text-[9px] font-bold text-[#4ade80]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                </span>
                CANLI
              </span>
            </div>

            {/* Şu an çalıyor */}
            <div
              className="mt-3.5 rounded-2xl p-3.5"
              style={{
                background: "linear-gradient(140deg, rgba(233,30,140,0.18), rgba(139,92,246,0.1) 55%, #1a0e2a)",
                border: "1px solid rgba(233,30,140,0.3)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "linear-gradient(140deg, #8b5cf6, #e91e8c)" }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="18" r="3" stroke="white" strokeWidth="2" />
                    <circle cx="18" cy="16" r="3" stroke="white" strokeWidth="2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#e91e8c]">Şu An Çalıyor</p>
                  <p className="truncate text-sm font-extrabold text-white">Bohemian Rhapsody</p>
                  <p className="truncate text-[11px] text-[#9ca3af]">Queen</p>
                </div>
                {/* Ekolayzer */}
                <div className="flex h-7 items-end gap-[3px]">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="eq-bar w-[3px] rounded-full"
                      style={{ height: "100%", background: "#e91e8c", animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[42%] rounded-full" style={{ background: PINK_GRADIENT }} />
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-[#6b7280] tabular-nums">
                  <span>2:29</span>
                  <span>5:55</span>
                </div>
              </div>
            </div>

            {/* Sıradakiler */}
            <p className="mb-2 mt-4 text-[9px] font-bold uppercase tracking-[0.16em] text-[#9ca3af]">Sıradakiler</p>
            <div className="space-y-1.5">
              {MOCK_QUEUE.map((q) => (
                <div
                  key={q.pos}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                  style={{ background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <span className="w-4 text-center text-[11px] font-black text-[#6b7280] tabular-nums">{q.pos}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-white">{q.title}</p>
                    <p className="truncate text-[9px] text-[#6b7280]">{q.artist}</p>
                  </div>
                  {q.priority && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" />
                    </svg>
                  )}
                </div>
              ))}
            </div>

            {/* İstek butonu */}
            <div
              className="mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-white"
              style={{ background: PINK_GRADIENT, boxShadow: "0 8px 24px -8px rgba(233,30,140,0.6)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Şarkı İste
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Fiyatlar -------------------------------- */

// Fiyatlar globaldir ve DB'den cache'li gelir ("global-pricing" tag'i, super admin
// kaydında revalidate) — sayfa kabuğu statik kalırken fiyatlar güncel kalır.
async function PackagesSection() {
  const [packages, unitPrice] = await Promise.all([getGlobalTokenPackages(), getTokenUnitPrice()]);

  return (
    <section id="fiyatlar" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">Fiyatlandırma</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">Şeffaf ve tek fiyat</h2>
        <p className="mt-4 text-sm leading-relaxed text-[#9ca3af] sm:text-base">
          Şarkı istemek için jeton kullanılır. Fiyat tüm mekanlarda aynıdır, jetonlar ödemenin
          ardından <strong className="text-white">anında</strong> hesabına yüklenir ve PlayMyJam
          kullanan tüm mekanlarda geçerlidir. Tüm fiyatlara KDV dahildir.
        </p>
        <div
          className="mx-auto mt-6 flex max-w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-3xl px-5 py-2.5"
          style={{ background: "rgba(233,30,140,0.08)", border: "1px solid rgba(233,30,140,0.25)", width: "fit-content" }}
        >
          <Coin size={20} />
          <span className="text-sm font-bold text-white">
            1 jeton = {fmt(unitPrice)} TL
          </span>
          <span className="text-xs text-[#9ca3af]">· istediğin adette satın alabilirsin</span>
        </div>
      </div>

      {packages.length > 0 && (
        <div className="mt-12 grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
          {packages.map((p) => {
            const savings = unitPrice > 0 ? Math.round((1 - p.price / p.tokens / unitPrice) * 100) : 0;
            const unit = fmt(p.price / p.tokens);
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
                    En Popüler
                  </span>
                )}
                <p className="text-sm font-bold text-[#9ca3af]">{p.label}</p>
                <p className="mt-3 text-[32px] font-black leading-none text-white">
                  {p.tokens}
                  <span className="ml-1.5 text-sm font-medium text-[#9ca3af]">jeton</span>
                </p>
                <p className="mt-1.5 text-xs text-[#6b7280]">₺{unit}/jeton</p>
                <div className="mt-4 flex items-baseline justify-between gap-1">
                  <p className="text-xl font-extrabold text-[#e91e8c]">{fmt(p.price)}₺</p>
                  {savings > 0 && (
                    <span className="rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-bold text-[#4ade80]">
                      %{savings} avantaj
                    </span>
                  )}
                </div>
                <Link
                  href={`/venue/${DEFAULT_VENUE}/tokens`}
                  className="mt-5 rounded-xl py-2.5 text-center text-sm font-bold text-white transition-transform active:scale-[0.97]"
                  style={
                    p.popular
                      ? { background: PINK_GRADIENT, boxShadow: "0 8px 24px -8px rgba(233,30,140,0.55)" }
                      : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }
                  }
                >
                  Satın Al
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-3.5">
        <CardLogos />
        <p className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          256-bit SSL ile güvenli ödeme · Anında dijital teslimat
        </p>
        <p className="max-w-lg text-center text-[11px] leading-relaxed text-[#6b7280]">
          Satın alımlar{" "}
          <Link href="/mesafeli-satis-sozlesmesi" className="underline hover:text-[#9ca3af]">
            Mesafeli Satış Sözleşmesi
          </Link>{" "}
          ve{" "}
          <Link href="/teslimat-iade" className="underline hover:text-[#9ca3af]">
            Teslimat ve İade Şartları
          </Link>
          &apos;na tabidir. Kullanılmamış paketlerde 14 gün içinde iade hakkın vardır.
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------- SSS ----------------------------------- */

const FAQS = [
  {
    q: "Jeton nedir, nerede kullanılır?",
    a: "Jeton, PlayMyJam platformunda şarkı isteği göndermek için kullanılan dijital birimdir. Yalnızca PlayMyJam kullanan mekanlardaki şarkı istekleri için geçerlidir; nakde çevrilemez ve platform dışına aktarılamaz. Bakiyen tüm PlayMyJam mekanlarında ortaktır.",
  },
  {
    q: "Ödeme nasıl yapılır, güvenli mi?",
    a: "Ödemeler kredi kartı veya banka kartı ile 256-bit SSL şifreli bağlantı üzerinden alınır. Kart bilgilerin bizde saklanmaz; işlemler lisanslı ödeme kuruluşu altyapısı üzerinden gerçekleştirilir.",
  },
  {
    q: "Jetonlarım ne zaman hesabıma geçer?",
    a: "Anında. Jetonlar dijital üründür — ödemen onaylandığı saniye bakiyene yüklenir ve hemen şarkı istemeye başlayabilirsin. Kargo veya bekleme süresi yoktur.",
  },
  {
    q: "İade hakkım var mı?",
    a: "Var. Paketteki jetonların hiçbirini kullanmadıysan satın alma tarihinden itibaren 14 gün içinde iade talep edebilirsin. Ayrıca şarkı isteğin mekan tarafından reddedilirse harcanan jetonlar bakiyene otomatik iade edilir. Detaylar Teslimat ve İade Şartları sayfasındadır.",
  },
  {
    q: "Şarkı isteğim ne kadar jeton tutar?",
    a: "Normal sıra isteği ve öncelikli sıra isteği için gereken jeton adedi mekana göre belirlenir ve istek göndermeden önce ekranda açıkça gösterilir. Öncelikli istekler sırada öne alınır.",
  },
  {
    q: "Mekanım için PlayMyJam'i nasıl kullanabilirim?",
    a: "İletişim bölümündeki e-posta veya telefon üzerinden bize ulaşman yeterli. Kurulum için ek donanım gerekmez; mekandaki mevcut ekran/hoparlör düzeni ve bir tarayıcı yeterlidir.",
  },
];

function FaqSection() {
  return (
    <section id="sss" className="mx-auto w-full max-w-3xl scroll-mt-24 px-5 py-20">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">SSS</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">Sık sorulan sorular</h2>
      </div>
      <div className="mt-10 space-y-3">
        {FAQS.map((f) => (
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

/* ---------------------------------- Footer --------------------------------- */

function Footer() {
  return (
    <footer className="border-t border-white/[0.06]" style={{ background: "#0c0814" }}>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Coin size={24} />
            <span className="text-base font-black tracking-tight text-white">PlayMyJam</span>
          </div>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-[#6b7280]">
            Kafe ve eğlence mekanlarında müzik sırasını misafirlere açan dijital şarkı istek
            platformu. {COMPANY.legalName} tarafından işletilmektedir.
          </p>
          <div className="mt-5">
            <CardLogos />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">Ürün</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li><Link href={`/venue/${DEFAULT_VENUE}`} className="hover:text-white">Uygulamayı Aç</Link></li>
            <li><a href="#nasil-calisir" className="hover:text-white">Nasıl Çalışır</a></li>
            <li><a href="#fiyatlar" className="hover:text-white">Fiyatlar</a></li>
            <li><a href="#sss" className="hover:text-white">Sık Sorulan Sorular</a></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">Yasal</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li><Link href="/hakkimizda" className="hover:text-white">Hakkımızda</Link></li>
            <li><Link href="/privacy" className="hover:text-white">Gizlilik Politikası</Link></li>
            <li><Link href="/terms" className="hover:text-white">Kullanım Şartları</Link></li>
            <li><Link href="/mesafeli-satis-sozlesmesi" className="hover:text-white">Mesafeli Satış Sözleşmesi</Link></li>
            <li><Link href="/teslimat-iade" className="hover:text-white">Teslimat ve İade</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ca3af]">İletişim</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#6b7280]">
            <li>
              <a href={`mailto:${COMPANY.email}`} className="hover:text-white">{COMPANY.email}</a>
            </li>
            <li>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="hover:text-white">{COMPANY.phone}</a>
            </li>
            <li className="leading-relaxed">{COMPANY.address}</li>
            <li><Link href="/iletisim" className="text-[#e91e8c] hover:text-[#ff2d9c]">İletişim sayfası →</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[11px] text-[#4b5563]">
          <p>© 2026 PlayMyJam · Tüm hakları saklıdır · Tüm ödemeler SSL ile güvence altındadır</p>
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#9ca3af]"
          >
            YouTube Hizmet Şartları
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------------- Sayfa ---------------------------------- */

const VALUE_PROPS = [
  {
    title: "Anında dijital teslimat",
    desc: "Jetonlar ödeme onaylanır onaylanmaz hesabında — bekleme yok, kargo yok.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#e91e8c" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Tek cüzdan, tüm mekanlar",
    desc: "Bakiyen PlayMyJam kullanan her mekanda geçerli; mekan değiştir, jetonun seninle gelsin.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="6" width="20" height="14" rx="3" stroke="#e91e8c" strokeWidth="2" />
        <path d="M2 10h20M16 15h2" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Güvenli ödeme",
    desc: "256-bit SSL, lisanslı ödeme altyapısı; kart bilgilerin bizde saklanmaz.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" stroke="#e91e8c" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    title: "Mekanı aç",
    desc: "Bulunduğun mekandaki QR kodu okut veya mekan bağlantısına dokun — uygulama tarayıcıda açılır, indirme gerekmez.",
  },
  {
    title: "Jetonunu al",
    desc: "Sana uygun paketi veya istediğin adette tekli jetonu seç; güvenli ödemenin ardından bakiyen anında yüklenir.",
  },
  {
    title: "Şarkını iste",
    desc: "Mekanın kataloğundan şarkını seç, normal ya da öncelikli sırayla kuyruğa ekle, çalma anını canlı takip et.",
  },
];

const VENUE_FEATURES = [
  {
    title: "Canlı kuyruk yönetimi",
    desc: "İstekleri tek panelden onayla, sırala veya reddet; reddedilen isteklerin jetonu misafire otomatik iade edilir.",
  },
  {
    title: "Ek donanım gerekmez",
    desc: "Mevcut ekran ve ses düzeninle çalışır; kurulum bir tarayıcı sekmesi kadar basit.",
  },
  {
    title: "İstatistik paneli",
    desc: "En çok istenen şarkılar, yoğun saatler ve istek hacmi — mekanının müzik nabzı tek ekranda.",
  },
  {
    title: "Misafir etkileşimi",
    desc: "Misafirler müziğe ortak olur, mekanda daha uzun vakit geçirir; müzik küratörlüğü sende kalır.",
  },
];

export default function HomePage() {
  return (
    <div id="top" className="min-h-dvh bg-[#0f0a18]">
      <Header />

      <main className="relative overflow-hidden">
        {/* Arka plan ışımaları */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
          style={{
            background:
              "radial-gradient(60% 55% at 30% 0%, rgba(233,30,140,0.14), transparent 70%), radial-gradient(50% 45% at 80% 10%, rgba(139,92,246,0.12), transparent 70%)",
          }}
        />

        {/* Hero */}
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
              Mekan içi dijital şarkı istek platformu
            </span>
            <h1 className="mt-6 text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[56px]">
              Mekanda müziği{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(100deg, #ff2d9c, #b18cff)" }}
              >
                sen seç
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#9ca3af] sm:text-base lg:mx-0">
              PlayMyJam, kafe ve eğlence mekanlarında çalma sırasını misafirlere açar. Jetonunu al,
              şarkını kuyruğa ekle, çalma anını saniye saniye takip et — DJ artık sensin.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link
                href={`/venue/${DEFAULT_VENUE}`}
                className="rounded-2xl px-7 py-4 text-base font-bold text-white transition-transform active:scale-[0.98]"
                style={{ background: PINK_GRADIENT, boxShadow: "0 12px 36px -10px rgba(233,30,140,0.6)" }}
              >
                Uygulamayı Aç
              </Link>
              <a
                href="#fiyatlar"
                className="rounded-2xl border border-white/15 bg-white/5 px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10"
              >
                Fiyatları Gör
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 lg:justify-start">
              <span className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
                </svg>
                SSL güvenli ödeme
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                Anında teslimat
              </span>
              <CardLogos />
            </div>
          </div>

          <PhoneMockup />
        </section>

        {/* Değer önerileri */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {VALUE_PROPS.map((v) => (
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

        {/* Nasıl çalışır */}
        <section id="nasil-calisir" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">Nasıl Çalışır</p>
            <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">Üç adımda sahne senin</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
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

        {/* Mekanlar için */}
        <section id="mekanlar" className="scroll-mt-24 border-y border-white/[0.06] py-20" style={{ background: "#120b1e" }}>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">Mekanlar İçin</p>
              <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
                Müziği misafirine aç,
                <br />
                kontrolü elinde tut
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9ca3af] sm:text-base">
                PlayMyJam mekanına yeni bir etkileşim katmanı ekler: misafirler şarkı ister, sen
                tek panelden yönetirsin. Hangi şarkının çalınabileceğine her zaman mekan karar
                verir.
              </p>
              <a
                href="#iletisim"
                className="mt-7 inline-block rounded-2xl px-6 py-3.5 text-sm font-bold text-white transition-transform active:scale-[0.98]"
                style={{ background: PINK_GRADIENT, boxShadow: "0 10px 28px -10px rgba(233,30,140,0.6)" }}
              >
                Mekanın için iletişime geç
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {VENUE_FEATURES.map((f) => (
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

        {/* Fiyatlar — global paketler, kabuk statik */}
        <Suspense fallback={null}>
          <PackagesSection />
        </Suspense>

        {/* SSS */}
        <FaqSection />

        {/* İletişim — ödeme kuruluşu şartı: ana sayfada "İletişim" başlığı altında eksiksiz bilgiler */}
        <section id="iletisim" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 pb-24 pt-4">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">İletişim</p>
            <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">Bize ulaş</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#9ca3af]">
              Soruların, iade taleplerin veya mekanına PlayMyJam kurmak için aşağıdaki kanalların
              hepsinden bize ulaşabilirsin.
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
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#9ca3af]">E-posta</p>
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
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#9ca3af]">Telefon</p>
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
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#9ca3af]">Adres</p>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-white">
                {COMPANY.address}
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[#6b7280]">
            İşletme sahibi: {COMPANY.legalName} — {COMPANY.brand}
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
