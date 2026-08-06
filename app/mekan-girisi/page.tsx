import { Suspense } from "react";
import type { Metadata } from "next";
import { getActiveVenues } from "@/lib/venue-cache";
import SiteHeader from "@/components/landing/SiteHeader";
import SiteFooter from "@/components/landing/SiteFooter";
import VenueAdminLogin from "@/components/landing/VenueAdminLogin";
import { VenueAdminLoginIntro } from "@/components/landing/VenueAdminLoginIntro";

export const metadata: Metadata = {
  title: "Mekan Girişi — PlayMyJam",
  description: "Mekan sahipleri buradan mekanını seçip PlayMyJam admin paneline giriş yapar.",
  robots: { index: false, follow: true },
};

async function LoginPanel() {
  const venues = await getActiveVenues();
  return <VenueAdminLogin venues={venues} />;
}

function LoginPanelSkeleton() {
  return (
    <div className="mx-auto h-80 w-full max-w-lg animate-pulse rounded-2xl border border-white/[0.05]" style={{ background: "#160d24" }} />
  );
}

export default function MekanGirisiPage() {
  return (
    <div className="min-h-dvh bg-[#0f0a18]">
      <SiteHeader />
      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-80"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, rgba(233,30,140,0.13), rgba(139,92,246,0.07) 50%, transparent 75%)",
          }}
        />
        <section className="relative mx-auto w-full max-w-6xl px-5 pb-24 pt-16">
          <VenueAdminLoginIntro />
          <div className="mt-10">
            <Suspense fallback={<LoginPanelSkeleton />}>
              <LoginPanel />
            </Suspense>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
