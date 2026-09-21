import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Fraunces } from "next/font/google";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getHubPage } from "@/lib/hub-server";
import { hubPath } from "@/lib/hub";
import HubLinks from "./HubLinks";
import ThemeToggle, { themeBootScript } from "./ThemeToggle";

/**
 * Mekan sayfası — plaketin ARKA yüzündeki QR buraya iner: /<slug>/bilgi
 *
 * Tasarım sitenin geri kalanıyla aynı renkleri konuşuyor (PMJ pembesi ve moru)
 * ama koyu neon panelin AÇIK karşılığı: tek parça aydınlık zemin. İlk tur yalnızca ince çizgilerle ayrılmış yazılardan
 * oluşuyordu ve ekran boş görünüyordu; ikinci turda denenen koyu başlık bloğu
 * da tutmadı. Ağırlık artık iki yerden geliyor: ÜSTTE sıkı bir başlık (kart
 * listesi ekranın yukarısında başlasın diye) ve simgeli, yüksek kartlar.
 *
 * PlayMyJam burada YÖNLENDİRME yapmaz; altta yalnızca küçük bir imza var.
 * Şarkı isteme akışı plaketin ön yüzündeki ayrı QR'ın işi.
 */

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  style: ["normal"],
  variable: "--font-hub-display",
  display: "swap",
});

export const viewport: Viewport = {
  // Tarayıcı çubuğu sayfanın zeminiyle birleşsin
  themeColor: "#faf7fc",
  width: "device-width",
  initialScale: 1,
};

// En az bir örnek param: cacheComponents açıkken params'ın çalışma zamanı
// API'si sayılmaması için gerekli (liste BOŞ olamaz, build hata verir).
// Yeni mekanlar ilk istekte üretilir — dynamicParams varsayılanı.
export async function generateStaticParams() {
  const { data } = await supabaseAdmin.from("venues").select("slug").limit(50);

  const slugs = ((data ?? []) as { slug: string }[]).map((v) => ({ venueSlug: v.slug }));
  // Liste BOŞ olamaz (build hata verir); hiç mekan yoksa bir örnek yeter.
  return slugs.length > 0 ? slugs : [{ venueSlug: "ornek" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}): Promise<Metadata> {
  const { venueSlug } = await params;
  const hub = await getHubPage(venueSlug);
  if (!hub) return { title: "PlayMyJam" };
  return {
    title: hub.name,
    description: hub.headline || `${hub.name} — menü, iletişim ve sosyal medya.`,
    // Mekanın kendi sayfası; arama sonuçlarına girmesine gerek yok, QR ile açılıyor
    robots: { index: false, follow: false },
  };
}

function PmjMark() {
  return (
    <div className="hub-shell hub-topbar">
      {/* Yönlendirme değil, imza: menüye bakan herkes markayı görsün yeter */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" className="hub-mark" />
      <span>PlayMyJam ile</span>
      <ThemeToggle />
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="hub-head">
      <PmjMark />
      <div className="hub-shell">
        <div className="hub-skeleton-logo" />
        <div className="hub-skeleton-name" />
      </div>
    </div>
  );
}

async function HubContent({ code }: { code: string }) {
  const hub = await getHubPage(code);
  if (!hub) notFound();

  return (
    <>
      <header className="hub-head">
        <PmjMark />

        <div className="hub-shell hub-identity">
          {hub.logoUrl ? (
            // Logo host'u mekandan mekana değişiyor — next/image yerine düz <img>
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hub.logoUrl} alt="" className="hub-logo" referrerPolicy="no-referrer" />
          ) : null}

          <h1 className="hub-name">{hub.name}</h1>
          {hub.headline && <p className="hub-headline">{hub.headline}</p>}
        </div>
      </header>

      <main className="hub-body">
        <div className="hub-shell">
          <HubLinks code={code} links={hub.links} />
        </div>
      </main>

      <footer className="hub-foot">
        <div className="hub-shell hub-foot-inner">
          <span className="hub-foot-code">playmyjam.com.tr{hubPath(code)}</span>
        </div>
      </footer>
    </>
  );
}

export default async function HubPage({ params }: { params: Promise<{ venueSlug: string }> }) {
  const { venueSlug } = await params;

  return (
    <div className={`${display.variable} hub-page`}>
      {/* Boyamadan önce çalışmalı: koyu temayı seçen biri beyaz bir kare görmesin */}
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      {/* Kök layout'un gövdesi koyu; bu sayfa kendi zemininde yaşıyor. */}
      <style>{`
        body { background: #faf7fc; }

        .hub-page {
          /* PMJ paleti — koyu panelin açık karşılığı.
             Pembe (#e91e8c) ve mor (#8b5cf6) sitenin her yerindeki vurgular. */
          --paper: #faf7fc;
          --card: #ffffff;
          --ink: #1a1024;
          --muted: #6e6580;
          --rule: rgba(26, 16, 36, 0.10);
          --accent: #e91e8c;
          --accent-2: #8b5cf6;

          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* ---- Koyu tema: aynı palet, ters çevrilmiş zemin ---- */
        :root[data-hub-theme="dark"] body { background: #120c1c; }

        :root[data-hub-theme="dark"] .hub-page {
          --paper: #120c1c;
          --card: #1d1430;
          --ink: #f5f1fa;
          --muted: #9d93b0;
          --rule: rgba(255, 255, 255, 0.10);
          /* Koyu zeminde pembe biraz açılmalı, yoksa okunmuyor */
          --accent: #ff5cb0;
          --accent-2: #a78bfa;
        }

        :root[data-hub-theme="dark"] .hub-head {
          background:
            radial-gradient(90% 70% at 50% 0%, rgba(233, 30, 140, 0.20), transparent 70%),
            radial-gradient(70% 60% at 15% 0%, rgba(139, 92, 246, 0.17), transparent 70%);
        }

        :root[data-hub-theme="dark"] .hub-foot-code { color: rgba(255, 255, 255, 0.28); }
        :root[data-hub-theme="dark"] .hub-skeleton-logo,
        :root[data-hub-theme="dark"] .hub-skeleton-name { background: rgba(255, 255, 255, 0.06); }

        @media (hover: hover) {
        }

        /* Tek sütun, her bölümde aynı kenar boşluğu */
        .hub-shell {
          width: 100%;
          max-width: 30rem;
          margin: 0 auto;
          padding-left: 24px;
          padding-right: 24px;
        }

        /* ---- Başlık: kağıdın üstüne sıcak bir yıkama, ortalanmış kimlik ---- */
        .hub-head {
          background:
            radial-gradient(90% 70% at 50% 0%, rgba(233, 30, 140, 0.10), transparent 70%),
            radial-gradient(70% 60% at 15% 0%, rgba(139, 92, 246, 0.09), transparent 70%);
          padding-bottom: 26px;
        }

        /* PMJ imzası: sayfanın sol üst köşesi. Yönlendirme değil, marka izi. */
        .hub-topbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 18px;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .hub-mark { width: 14px; height: 14px; object-fit: contain; opacity: 0.8; }

        /* Tema düğmesi: iki etiket de basılır, hangisinin görüneceğine CSS
           karar verir — sunucu ve istemci render'ı hep aynı olsun diye. */
        .hub-theme {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          padding: 4px 0 4px 12px;
          border: 0;
          background: transparent;
          color: var(--muted);
          font: inherit;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          transition: color 160ms ease;
        }
        /* Gizleme kuralları .hub-theme ile niteleniyor: aksi halde ortak
           görünüm kuralı (daha özgül) gizlenen etiketi geri açıyor ve iki
           etiket birden görünüyordu. */
        .hub-theme .hub-theme-dark,
        .hub-theme .hub-theme-light { display: inline-flex; align-items: center; gap: 7px; }
        .hub-theme .hub-theme-light { display: none; }
        :root[data-hub-theme="dark"] .hub-theme .hub-theme-dark { display: none; }
        :root[data-hub-theme="dark"] .hub-theme .hub-theme-light { display: inline-flex; }

        @media (hover: hover) {
          .hub-theme:hover { color: var(--accent); }
        }

        /* Mekanın kimliği ortada: büyük logo, adı, tek cümlesi */
        .hub-identity { text-align: center; padding-top: 26px; }

        .hub-logo {
          display: block;
          margin: 0 auto;
          width: 108px;
          height: 108px;
          object-fit: contain;
        }

        .hub-name {
          font-family: var(--font-hub-display), Georgia, serif;
          font-weight: 600;
          font-variation-settings: "SOFT" 0, "WONK" 1;
          font-size: clamp(34px, 10.5vw, 44px);
          line-height: 1.04;
          letter-spacing: -0.025em;
          margin-top: 20px;
          text-wrap: balance;
        }

        .hub-headline {
          margin: 10px auto 0;
          font-size: 15px;
          line-height: 1.5;
          color: var(--muted);
          max-width: 24rem;
          text-wrap: balance;
        }

        /* ---- Gövde ---- */
        .hub-body {
          flex: 1;
          padding: 4px 0 30px;
        }

        /* ---- Liste: kutu yok, ince çizgilerle ayrılmış tipografik dizin ---- */
        .hub-list { border-top: 1px solid var(--rule); }

        .hub-row {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          width: 100%;
          text-align: left;
          padding: 19px 2px 20px;
          border: 0;
          border-bottom: 1px solid var(--rule);
          background: transparent;
          color: inherit;
          text-decoration: none;
          /* Wi-Fi satırı <button>: tarayıcı yazı tipini kendi varsayılanına
             düşürmesin */
          font-family: inherit;
          font-size: inherit;
          transition: padding-left 200ms ease;
        }

        /* Sıra numarası: sayfanın ritmini kuran sol sütun */
        .hub-num {
          flex-shrink: 0;
          width: 30px;
          padding-top: 7px;
          font-family: var(--font-hub-display), Georgia, serif;
          font-size: 17px;
          font-variant-numeric: tabular-nums;
          color: var(--accent);
          opacity: 0.55;
        }

        .hub-row-body { flex: 1; min-width: 0; }

        .hub-row-title {
          display: block;
          font-family: var(--font-hub-display), Georgia, serif;
          font-size: clamp(22px, 6.4vw, 26px);
          line-height: 1.15;
          letter-spacing: -0.015em;
          text-wrap: balance;
        }

        .hub-row-sub {
          display: block;
          margin-top: 5px;
          font-size: 14px;
          line-height: 1.45;
          color: var(--muted);
          overflow-wrap: anywhere;
        }

        .hub-out {
          flex-shrink: 0;
          margin-top: 8px;
          color: var(--muted);
          opacity: 0.55;
          transition: transform 200ms ease, color 200ms ease, opacity 200ms ease;
        }

        /* Dokunmatikte hover yok: satırlar zaten tam görünür durumda —
           kaplama düğmeler görünmez ama tıklanabilir tuzağına düşülmesin. */
        @media (hover: hover) {
          .hub-row:hover { padding-left: 8px; }
          .hub-row:hover .hub-row-title { color: var(--accent); }
          .hub-row:hover .hub-out { transform: translate(3px, -3px); color: var(--accent); opacity: 1; }
        }
        .hub-row:active .hub-row-title { color: var(--accent); }

        /* ---- Wi-Fi şifresi: kutu değil, altı çizili büyük punto ---- */
        .hub-pass {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 4px 12px;
          margin-top: 12px;
        }

        .hub-pass-value {
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 20px;
          letter-spacing: 0.03em;
          color: var(--accent);
          border-bottom: 1px dashed currentColor;
          padding-bottom: 2px;
          overflow-wrap: anywhere;
        }

        .hub-pass-action {
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .hub-empty { color: var(--muted); font-size: 15px; padding: 24px 0; }

        /* ---- İmza ---- */
        .hub-foot { padding-bottom: 28px; }
        .hub-foot-inner {
          padding-top: 18px;
          border-top: 1px solid var(--rule);
          text-align: center;
        }
        .hub-foot-code {
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 11px;
          color: rgba(26, 16, 36, 0.3);
        }

        /* Yükleme anı: başlık bloğu yerinde dursun, zıplama olmasın */
        .hub-skeleton-logo {
          width: 108px; height: 108px; margin: 26px auto 0;
          border-radius: 10px; background: rgba(26, 16, 36, 0.05);
        }
        .hub-skeleton-name {
          width: 58%; height: 38px; margin: 20px auto 0;
          border-radius: 8px; background: rgba(26, 16, 36, 0.05);
        }
      `}</style>

      <Suspense fallback={<HubSkeleton />}>
        <HubContent code={venueSlug} />
      </Suspense>
    </div>
  );
}
