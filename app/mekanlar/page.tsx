import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getActiveVenues } from "@/lib/venue-cache";
import SiteHeader from "@/components/landing/SiteHeader";
import SiteFooter from "@/components/landing/SiteFooter";

export const metadata: Metadata = {
  title: "Mekanlar — PlayMyJam",
  description: "PlayMyJam kullanan mekanları keşfet; mekanını seç, şarkı istemeye başla.",
};

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

// Baş harf avatarı: mekan adından deterministik gradient (logo host'ları değişken
// olduğu için remote görsel yerine tutarlı bir görsel dil tercih edildi)
const AVATAR_GRADIENTS = [
  "linear-gradient(140deg, #e91e8c, #8b5cf6)",
  "linear-gradient(140deg, #8b5cf6, #3b82f6)",
  "linear-gradient(140deg, #f59e0b, #e91e8c)",
  "linear-gradient(140deg, #3b82f6, #22c55e)",
  "linear-gradient(140deg, #ff2d9c, #f59e0b)",
];

function venueGradient(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

async function VenueList() {
  const venues = await getActiveVenues();

  if (venues.length === 0) {
    return (
      <div
        className="mx-auto max-w-md rounded-2xl border border-white/[0.08] px-6 py-12 text-center"
        style={{ background: "#160d24" }}
      >
        <p className="text-sm font-bold text-white">Henüz listelenen mekan yok</p>
        <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">
          Mekanına PlayMyJam kurmak istersen{" "}
          <Link href="/#iletisim" className="text-[#e91e8c] underline">
            bize ulaş
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {venues.map((v) => (
        <div
          key={v.slug}
          className="flex flex-col rounded-2xl border border-white/[0.07] p-5 transition-colors hover:border-[#e91e8c]/35"
          style={{ background: "#160d24" }}
        >
          <div className="flex items-center gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black text-white"
              style={{ background: venueGradient(v.name), boxShadow: "0 8px 20px -8px rgba(233,30,140,0.4)" }}
            >
              {v.name.trim().charAt(0).toLocaleUpperCase("tr-TR")}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold text-white">{v.name}</h2>
              <p className="mt-0.5 truncate text-xs text-[#9ca3af]">
                {v.tagline?.trim() || "Şarkı istekleri açık"}
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Link
              href={`/venue/${v.slug}`}
              className="flex-1 rounded-xl py-2.5 text-center text-sm font-bold text-white transition-transform active:scale-[0.97]"
              style={{ background: PINK_GRADIENT, boxShadow: "0 8px 22px -8px rgba(233,30,140,0.55)" }}
            >
              Mekanı Aç
            </Link>
            <Link
              href={`/venue/${v.slug}/queue`}
              className="rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-[#9ca3af] transition-colors hover:bg-white/10 hover:text-white"
              aria-label={`${v.name} canlı sıra`}
            >
              Sıra
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
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
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">Mekanlar</p>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Mekanını seç, sahneyi devral</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#9ca3af] sm:text-base">
              PlayMyJam kullanan mekanlar aşağıda. Bulunduğun mekanı aç, şarkı kataloğuna göz at
              ve jetonunla sıraya şarkı ekle — bakiyen tüm mekanlarda geçerli.
            </p>
          </div>

          <div className="mt-12">
            <Suspense fallback={<VenueListSkeleton />}>
              <VenueList />
            </Suspense>
          </div>

          <p className="mt-10 text-center text-xs text-[#6b7280]">
            Mekanını burada görmek ister misin?{" "}
            <Link href="/#iletisim" className="text-[#e91e8c] underline hover:text-[#ff2d9c]">
              Bize ulaş
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
