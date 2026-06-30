import { createClient } from "@/lib/supabase/server";
import { getVenueBySlug } from "@/lib/venue-cache";
import ProfileClient from "./ProfileClient";

interface Props {
  params: Promise<{ venueId: string }>;
}

export default async function ProfilePage({ params }: Props) {
  const { venueId } = await params;
  const supabase = await createClient();

  const [userRes, venue] = await Promise.all([supabase.auth.getClaims(), getVenueBySlug(venueId)]);
  const userId = userRes.data?.claims.sub;
  const claimsEmail = (userRes.data?.claims as { email?: string } | undefined)?.email ?? "";

  let username = "";
  let email = claimsEmail;
  let tokenBalance = 0;
  let favCount = 0;
  let requestCount = 0;

  if (userId) {
    const [profileRes, favRes, reqRes] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", userId).single(),
      supabase.from("user_favorites").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("queue").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    username = profileRes.data?.username ?? email.split("@")[0] ?? "";
    favCount = favRes.count ?? 0;
    requestCount = reqRes.count ?? 0;

    if (venue) {
      const { data: tk } = await supabase
        .from("user_tokens")
        .select("balance")
        .eq("user_id", userId)
        .eq("venue_id", venue.id)
        .maybeSingle();
      tokenBalance = tk?.balance ?? 0;
    }
  }

  return (
    <ProfileClient
      venueId={venueId}
      username={username}
      email={email}
      tokenBalance={tokenBalance}
      favCount={favCount}
      requestCount={requestCount}
    />
  );
}
