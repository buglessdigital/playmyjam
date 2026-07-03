import { Suspense } from "react";
import { getVenueBySlug, getVenueTokenPackages } from "@/lib/venue-cache";
import TokensClient from "./TokensClient";
import TokensLoading from "./loading";

// Kabukta cache'li paket listesi — geçişte anında görünür; bakiye client'ta tek sorgu.
// runtime prefetch: kabuk mekan bazında istek anında üretilip prefetch'e servis edilir;
// samples yalnızca build doğrulaması için örnek değerdir.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function TokensPage({ params }: Props) {
  return (
    <Suspense fallback={<TokensLoading />}>
      {params.then(({ venueId }) => (
        <TokensShell venueId={venueId} />
      ))}
    </Suspense>
  );
}

async function TokensShell({ venueId }: { venueId: string }) {
  const venue = await getVenueBySlug(venueId);
  const packages = venue ? await getVenueTokenPackages(venue.id) : [];

  return (
    <TokensClient
      venueId={venueId}
      venueDbId={venue?.id ?? ""}
      initialPackages={packages}
      initialSelectedId={packages[1]?.id ?? packages[0]?.id ?? ""}
    />
  );
}
