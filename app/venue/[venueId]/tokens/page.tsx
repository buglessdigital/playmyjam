import { Suspense } from "react";
import { getGlobalTokenPackages, getTokenUnitPrice } from "@/lib/pricing-cache";
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
  // Paketler ve birim fiyat globaldir (super admin belirler) — mekandan bağımsız
  const [packages, unitPrice] = await Promise.all([getGlobalTokenPackages(), getTokenUnitPrice()]);

  return (
    <TokensClient
      venueId={venueId}
      initialPackages={packages}
      initialSelectedId={packages.find((p) => p.popular)?.id ?? packages[0]?.id ?? ""}
      unitPrice={unitPrice}
    />
  );
}
