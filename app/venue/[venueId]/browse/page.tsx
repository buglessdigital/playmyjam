import { Suspense } from "react";
import { getVenueBySlug, getVenueSongCatalog } from "@/lib/venue-cache";
import BrowseClient from "./BrowseClient";
import BrowseLoading from "./loading";

// Kabuk yalnızca cache'li veri içerir (venue + şarkı kataloğu) — geçişte liste anında
// görünür. Kullanıcıya özel durum (bakiye, favoriler, cooldown) client'ta tek RPC ile gelir.
// runtime prefetch: kabuk mekan bazında istek anında üretilip prefetch'e servis edilir;
// samples yalnızca build doğrulaması için örnek değerdir.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function BrowsePage({ params }: Props) {
  return (
    <Suspense fallback={<BrowseLoading />}>
      {params.then(({ venueId }) => (
        <BrowseShell venueId={venueId} />
      ))}
    </Suspense>
  );
}

async function BrowseShell({ venueId }: { venueId: string }) {
  const venue = await getVenueBySlug(venueId);
  const catalog = venue ? await getVenueSongCatalog(venue.id) : [];

  return (
    <BrowseClient
      venueId={venueId}
      venueDbId={venue?.id ?? ""}
      initialVenueSongs={catalog}
    />
  );
}
