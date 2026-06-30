import { createClient } from "@/lib/supabase/server";
import { getVenueBySlug } from "@/lib/venue-cache";
import TokensClient from "./TokensClient";

interface Props {
  params: Promise<{ venueId: string }>;
}

export default async function TokensPage({ params }: Props) {
  const { venueId } = await params;
  const supabase = await createClient();

  const venue = await getVenueBySlug(venueId);

  let initialPackages: { id: string; label: string; tokens: number; price: number; popular: boolean }[] = [];
  let initialBalance = 0;
  let initialSelectedId = "";

  if (venue) {
    const [pkgsRes, userRes] = await Promise.all([
      supabase
        .from("token_packages")
        .select("id, label, tokens, price, popular")
        .eq("venue_id", venue.id)
        .order("display_order"),
      supabase.auth.getClaims(),
    ]);

    initialPackages = (pkgsRes.data ?? []) as typeof initialPackages;
    initialSelectedId = initialPackages[1]?.id ?? initialPackages[0]?.id ?? "";

    const userId = userRes.data?.claims.sub;
    if (userId) {
      const { data: tk } = await supabase
        .from("user_tokens")
        .select("balance")
        .eq("user_id", userId)
        .eq("venue_id", venue.id)
        .maybeSingle();
      initialBalance = tk?.balance ?? 0;
    }
  }

  return (
    <TokensClient
      venueId={venueId}
      initialPackages={initialPackages}
      initialBalance={initialBalance}
      initialSelectedId={initialSelectedId}
    />
  );
}
