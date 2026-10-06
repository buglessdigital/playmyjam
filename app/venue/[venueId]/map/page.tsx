import { Suspense } from "react";
import { getMapVenues } from "@/lib/venue-map";
import MapClient from "./MapClient";
import MapLoading from "./loading";

// Anlaşmalı mekanlar haritası. İğneler kabukta (cache'li, "venues-list" tag'i)
// gelir; mekana dokununca açılan kartın canlı verisi /api/venue-map/[slug]'dan.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function MapPage({ params }: Props) {
  return (
    <Suspense fallback={<MapLoading />}>
      {params.then(({ venueId }) => (
        <MapShell venueId={venueId} />
      ))}
    </Suspense>
  );
}

async function MapShell({ venueId }: { venueId: string }) {
  const venues = await getMapVenues();
  return <MapClient venueId={venueId} venues={venues} />;
}
