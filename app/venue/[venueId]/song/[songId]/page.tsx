import { Suspense } from "react";
import { getVenueBySlug } from "@/lib/venue-cache";
import { getTrackForDetail } from "@/lib/track-lookup";
import { getTokenUnitPrice } from "@/lib/pricing-cache";
import SongDetailClient from "./SongDetailClient";
import SongDetailLoading from "./loading";

// Kabuk yalnızca cache'li veri içerir (venue + şarkı detayı, cacheLife: days).
// Şarkı detayı ortak havuzdan okunur, YouTube Data API'ye gitmez (bkz. lib/track-lookup.ts).
// Kullanıcıya özel durum (favori, bakiye, cooldown, kuyruk) client'ta tek RPC ile gelir.
// songId build'de numaralandırılamadığı için instant doğrulaması kapalı; Suspense
// fallback'i sayesinde geçiş yine anında (kabuk = loading iskeleti).
export const unstable_instant = false;

interface Props {
  params: Promise<{ venueId: string; songId: string }>;
}

export default function SongDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<SongDetailLoading />}>
      {params.then(({ venueId, songId }) => (
        <SongDetailShell venueId={venueId} songId={songId} />
      ))}
    </Suspense>
  );
}

async function SongDetailShell({ venueId, songId }: { venueId: string; songId: string }) {
  const [venue, track, tokenUnitPrice] = await Promise.all([
    getVenueBySlug(venueId),
    getTrackForDetail(songId).catch(() => null),
    getTokenUnitPrice(),
  ]);

  return (
    <SongDetailClient
      venueId={venueId}
      venueDbId={venue?.id ?? ""}
      track={venue ? track : null}
      requestCost={venue?.request_cost ?? 1}
      priorityCost={venue?.priority_cost ?? 2}
      tokenUnitPrice={tokenUnitPrice}
    />
  );
}
