import { Suspense } from "react";
import type { Metadata } from "next";
import { getGlobalTokenPackages, getTokenUnitPrice } from "@/lib/pricing-cache";
import SiteHeader from "@/components/landing/SiteHeader";
import SiteFooter from "@/components/landing/SiteFooter";
import PricingSection from "@/components/landing/PricingSection";
import {
  ContactSection,
  FaqSection,
  ForVenuesSection,
  HeroSection,
  HowItWorksSection,
  ValuePropsSection,
  VenueApplicationSection,
} from "@/components/landing/LandingSections";

// SEO metadata sunucuda üretilir ve Türkçe kalır: dil tercihi istemcide tutulduğu
// için burada okunamaz (kök layout'un statikliği korunuyor).
export const metadata: Metadata = {
  title: "PlayMyJam — Mekanda müziği sen seç",
  description:
    "PlayMyJam, kafe ve eğlence mekanlarında müzik sırasını misafirlere açan dijital şarkı istek platformudur. Jeton satın al, şarkını sıraya ekle, çalma anını canlı takip et.",
};

// Fiyatlar globaldir ve DB'den cache'li gelir ("global-pricing" tag'i, super admin
// kaydında revalidate) — sayfa kabuğu statik kalırken fiyatlar güncel kalır.
async function Packages() {
  const [packages, unitPrice] = await Promise.all([getGlobalTokenPackages(), getTokenUnitPrice()]);
  return <PricingSection packages={packages} unitPrice={unitPrice} />;
}

export default function HomePage() {
  return (
    <div id="top" className="min-h-dvh bg-[#0f0a18]">
      <SiteHeader />

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

        <HeroSection />
        <ValuePropsSection />
        <HowItWorksSection />
        <ForVenuesSection />
        <VenueApplicationSection />

        <Suspense fallback={null}>
          <Packages />
        </Suspense>

        <FaqSection />
        <ContactSection />
      </main>

      <SiteFooter />
    </div>
  );
}
