import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getVenueBySlug, getVenueSongCatalog } from "@/lib/venue-cache";
import BrowseClient from "./BrowseClient";
import BrowseLoading from "./loading";

export const unstable_instant = false;

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function BrowsePage({ params }: Props) {
  return (
    <Suspense fallback={<BrowseLoading />}>
      <BrowsePageContent params={params} />
    </Suspense>
  );
}

async function BrowsePageContent({ params }: Props) {
  const { venueId } = await params;
  const venue = await getVenueBySlug(venueId);

  if (!venue) {
    return (
      <BrowseClient
        venueId={venueId}
        venueDbId=""
        initialVenueSongs={[]}
        initialQueuedSongIds={[]}
        initialRecentlyPlayed={[]}
        initialTokenBalance={0}
        initialFavoriteIds={[]}
      />
    );
  }

  return <BrowseDynamicContent venueId={venueId} venueDbId={venue.id} />;
}

async function BrowseDynamicContent({ venueId, venueDbId }: { venueId: string; venueDbId: string }) {
  const supabase = await createClient();
  const cooldownSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const [userRes, initialVenueSongs, queueRes, playedRes, nowPlayingRes] = await Promise.all([
    supabase.auth.getClaims(),
    getVenueSongCatalog(venueDbId),
    supabase
      .from("queue")
      .select("song_id")
      .eq("venue_id", venueDbId)
      .eq("status", "queued")
      .not("user_id", "is", null),
    supabase
      .from("queue")
      .select("song_id, played_at")
      .eq("venue_id", venueDbId)
      .eq("status", "played")
      .not("user_id", "is", null)
      .gte("played_at", cooldownSince),
    supabase
      .from("queue")
      .select("song_id, added_at")
      .eq("venue_id", venueDbId)
      .eq("status", "playing")
      .not("user_id", "is", null)
      .maybeSingle(),
  ]);

  const userId = userRes.data?.claims.sub;

  const [tokensRes, favsRes] = await Promise.all([
    userId
      ? supabase.from("user_tokens").select("balance").eq("user_id", userId).eq("venue_id", venueDbId).maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? supabase.from("user_favorites").select("song_id").eq("user_id", userId)
      : Promise.resolve({ data: null }),
  ]);

  const initialQueuedSongIds = (queueRes.data ?? []).map((q: { song_id: string }) => q.song_id);

  const recentlyPlayedMap: { song_id: string; played_at: number }[] = [];
  (playedRes.data ?? []).forEach((r: { song_id: string; played_at: string | null }) => {
    if (r.played_at) recentlyPlayedMap.push({ song_id: r.song_id, played_at: new Date(r.played_at).getTime() });
  });
  const np = nowPlayingRes.data;
  if (np?.song_id) {
    const startMs = np.added_at ? new Date(np.added_at).getTime() : Date.now();
    recentlyPlayedMap.push({ song_id: np.song_id, played_at: startMs });
  }

  const initialTokenBalance = tokensRes.data?.balance ?? 0;
  const initialFavoriteIds = (favsRes.data ?? []).map((f: { song_id: string }) => f.song_id);

  return (
    <BrowseClient
      venueId={venueId}
      venueDbId={venueDbId}
      initialVenueSongs={initialVenueSongs}
      initialQueuedSongIds={initialQueuedSongIds}
      initialRecentlyPlayed={recentlyPlayedMap}
      initialTokenBalance={initialTokenBalance}
      initialFavoriteIds={initialFavoriteIds}
    />
  );
}
