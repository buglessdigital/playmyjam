import { Suspense } from "react";
import { getVenueBySlug } from "@/lib/venue-cache";
import QueueClient from "./QueueClient";
import QueueLoading from "./loading";

// Geçişlerin anında olması build'de doğrulanır: kabuk yalnızca cache'li veri içerir,
// canlı kuyruk/şu-an-çalan verisi client'ta tek RPC ile gelir (realtime zaten orada).
// runtime prefetch: kabuk mekan bazında istek anında üretilip prefetch'e servis edilir;
// samples yalnızca build doğrulaması için örnek değerdir.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function QueuePage({ params }: Props) {
  return (
    <Suspense fallback={<QueueLoading />}>
      {params.then(({ venueId }) => (
        <QueueShell venueId={venueId} />
      ))}
    </Suspense>
  );
}

async function QueueShell({ venueId }: { venueId: string }) {
  const venue = await getVenueBySlug(venueId);
  return (
    <QueueClient
      venueId={venueId}
      venueName={venue?.name ?? ""}
      venueDbId={venue?.id ?? ""}
    />
  );
}
