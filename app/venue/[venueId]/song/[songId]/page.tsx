import { Suspense } from "react";
import { getVenueBySlug } from "@/lib/venue-cache";
import { getTrackDetails } from "@/lib/spotify";
import SongDetailClient from "./SongDetailClient";
import SongDetailLoading from "./loading";

// Kabuk yalnızca cache'li veri içerir (venue + Spotify track detayı, cacheLife: days).
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
  const [venue, track] = await Promise.all([
    getVenueBySlug(venueId),
    getTrackDetails(songId).catch(() => null),
  ]);

  return (
    <SongDetailClient
      venueId={venueId}
      venueDbId={venue?.id ?? ""}
      track={venue ? track : null}
    />
  );
}
