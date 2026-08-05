import { Suspense } from "react";
import type { Metadata } from "next";
import { getActiveVenues } from "@/lib/venue-cache";
import SiteHeader from "@/components/landing/SiteHeader";
import SiteFooter from "@/components/landing/SiteFooter";
import VenueGrid, { VenuesPageIntro, VenuesPageOutro } from "@/components/landing/VenueGrid";

export const metadata: Metadata = {
  title: "Mekanlar — PlayMyJam",
  description: "PlayMyJam kullanan mekanları keşfet; mekanını seç, şarkı istemeye başla.",
};

async function VenueList() {
  const venues = await getActiveVenues();
  return <VenueGrid venues={venues} />;
}

function VenueListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl border border-white/[0.05]" style={{ background: "#160d24" }} />
      ))}
    </div>
  );
}

export default function MekanlarPage() {
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
          <VenuesPageIntro />

          <div className="mt-12">
            <Suspense fallback={<VenueListSkeleton />}>
              <VenueList />
            </Suspense>
          </div>

          <VenuesPageOutro />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
