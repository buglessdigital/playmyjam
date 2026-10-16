import type { Metadata } from "next";
import SiteHeader from "@/components/landing/SiteHeader";
import SiteFooter from "@/components/landing/SiteFooter";
import VenueRegisterIntro from "@/components/landing/VenueRegisterIntro";
import VenueApplicationForm from "@/components/landing/VenueApplicationForm";
import BackLink from "@/components/ui/BackLink";
import { landingFontVars } from "@/components/landing/fonts";

export const metadata: Metadata = {
  title: "Mekanını Kaydet — PlayMyJam",
  description:
    "Mekanını PlayMyJam'e ücretsiz kaydet: misafirlerin şarkı istesin, müzik akışı senin kontrolünde kalsın. Ek donanım gerekmez.",
};

// Mekan başvuru formu eskiden ana sayfanın ortasındaydı; kendi adresi olsun ki
// header/footer'dan, broşürden, mesajdan tek bağlantıyla açılabilsin.
// Talepler super admin panelindeki "Mekan Talepleri"ne düşer.
export default function MekanKayitPage() {
  return (
    <div className={`min-h-dvh bg-[#0f0a18] ${landingFontVars}`}>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-6 sm:px-6">
        <BackLink />
        <div className="mt-6 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <VenueRegisterIntro />
          <div>
            <VenueApplicationForm />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
