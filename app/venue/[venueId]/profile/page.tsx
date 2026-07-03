import { Suspense } from "react";
import { getVenueBySlug } from "@/lib/venue-cache";
import ProfileClient from "./ProfileClient";
import ProfileLoading from "./loading";

// Kabuk yalnızca cache'li venue verisi içerir; kullanıcı özeti (isim, bakiye,
// sayaçlar) client'ta tek RPC ile gelir.
// runtime prefetch: kabuk mekan bazında istek anında üretilip prefetch'e servis edilir;
// samples yalnızca build doğrulaması için örnek değerdir.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function ProfilePage({ params }: Props) {
  return (
    <Suspense fallback={<ProfileLoading />}>
      {params.then(({ venueId }) => (
        <ProfileShell venueId={venueId} />
      ))}
    </Suspense>
  );
}

async function ProfileShell({ venueId }: { venueId: string }) {
  const venue = await getVenueBySlug(venueId);
  return <ProfileClient venueId={venueId} venueDbId={venue?.id ?? ""} />;
}
