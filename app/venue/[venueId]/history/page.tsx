import { Suspense } from "react";
import { getVenueBySlug } from "@/lib/venue-cache";
import HistoryClient from "./HistoryClient";
import HistoryLoading from "./loading";

// Kabukta cache'li venue çözümü ("tekrar çaldır" bulunulan mekanın kuyruğuna ekler);
// geçmiş client'ta tek RPC ile gelir (tüm mekanlar, RLS korumalı).
// runtime prefetch: kabuk mekan bazında istek anında üretilip prefetch'e servis edilir.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function HistoryPage({ params }: Props) {
  return (
    <Suspense fallback={<HistoryLoading />}>
      {params.then(({ venueId }) => (
        <HistoryShell venueId={venueId} />
      ))}
    </Suspense>
  );
}

async function HistoryShell({ venueId }: { venueId: string }) {
  const venue = await getVenueBySlug(venueId);
  return (
    <HistoryClient
      venueDbId={venue?.id ?? ""}
      venueName={venue?.name ?? ""}
      requestCost={venue?.request_cost ?? 1}
    />
  );
}
