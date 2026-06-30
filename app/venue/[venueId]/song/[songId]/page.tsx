import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getVenueBySlug } from "@/lib/venue-cache";
import { getTrackDetails } from "@/lib/spotify";
import SongDetailClient from "./SongDetailClient";
import SongDetailLoading from "./loading";

export const unstable_instant = false;

interface Props {
  params: Promise<{ venueId: string; songId: string }>;
}

export default function SongDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<SongDetailLoading />}>
      <SongDetailPageContent params={params} />
    </Suspense>
  );
}

async function SongDetailPageContent({ params }: Props) {
  const { venueId, songId } = await params;

  const [venue, track] = await Promise.all([
    getVenueBySlug(venueId),
    getTrackDetails(songId).catch(() => null),
  ]);

  if (!venue || !track) {
    return (
      <SongDetailClient
        venueId={venueId}
        venueDbId=""
        track={null}
        dbSongId={null}
        playCount={0}
        inVenueList={false}
        isFavorite={false}
        tokenBalance={0}
        cooldown={{ remainingMs: 0, reason: null }}
        initialQueueEntries={[]}
        initialNowPlaying={null}
      />
    );
  }

  return <SongDetailDynamicContent venueId={venueId} venueDbId={venue.id} songId={songId} track={track} />;
}

async function SongDetailDynamicContent({
  venueId,
  venueDbId,
  songId,
  track,
}: {
  venueId: string;
  venueDbId: string;
  songId: string;
  track: NonNullable<Awaited<ReturnType<typeof getTrackDetails>>>;
}) {
  const supabase = await createClient();
  const cooldownSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // dbSongId'ye bağlı sorguları, songRes'in tek başına dönmesini beklemeden
  // diğer bağımsız sorgularla aynı anda yürütüyoruz — sıralı round-trip'i önler.
  const userPromise = supabase.auth.getClaims();
  const songPromise = supabase
    .from("songs")
    .select("id")
    .eq("spotify_track_id", songId)
    .maybeSingle();
  const queuePromise = supabase
    .from("queue")
    .select("priority, song_id, songs(duration_ms)")
    .eq("venue_id", venueDbId)
    .eq("status", "queued")
    .not("user_id", "is", null);
  const nowPlayingPromise = supabase
    .from("now_playing")
    .select("song_id, progress_ms, is_playing, started_at, songs(duration_ms)")
    .eq("venue_id", venueDbId)
    .maybeSingle();

  const [userRes, songRes] = await Promise.all([userPromise, songPromise]);
  const userId = userRes.data?.claims.sub;
  const dbSongId = songRes.data?.id ?? null;

  const dependentPromise = dbSongId
    ? Promise.all([
        supabase
          .from("venue_songs")
          .select("play_count, in_venue_list")
          .eq("venue_id", venueDbId)
          .eq("song_id", dbSongId)
          .maybeSingle(),
        userId
          ? supabase.from("user_favorites").select("song_id").eq("user_id", userId).eq("song_id", dbSongId).maybeSingle()
          : Promise.resolve({ data: null }),
        userId
          ? supabase.from("user_tokens").select("balance").eq("user_id", userId).eq("venue_id", venueDbId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("queue")
          .select("played_at")
          .eq("venue_id", venueDbId)
          .eq("song_id", dbSongId)
          .eq("status", "played")
          .not("user_id", "is", null)
          .gte("played_at", cooldownSince)
          .order("played_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    : null;

  const [queueRes, nowPlayingRes, dependentRes] = await Promise.all([queuePromise, nowPlayingPromise, dependentPromise]);

  let playCount = 0;
  let inVenueList = false;
  let isFavorite = false;
  let tokenBalance = 0;
  let recentlyPlayedAt: number | null = null;

  if (dependentRes) {
    const [vSongRes, favRes, tokensRes, playedRes] = dependentRes;
    playCount = vSongRes.data?.play_count ?? 0;
    inVenueList = vSongRes.data?.in_venue_list ?? false;
    isFavorite = !!favRes.data;
    tokenBalance = tokensRes.data?.balance ?? 0;
    recentlyPlayedAt = playedRes.data?.played_at ? new Date(playedRes.data.played_at).getTime() : null;
  }

  const queueEntries = (queueRes.data ?? []) as unknown as { priority: boolean; song_id: string; songs: { duration_ms: number } | null }[];
  const np = nowPlayingRes.data as unknown as { song_id: string | null; progress_ms: number; is_playing: boolean; songs: { duration_ms: number } | null } | null;

  const isQueued = !!dbSongId && queueEntries.some((e) => e.song_id === dbSongId);
  let cooldown: { remainingMs: number; reason: "played" | "queued" | null } = { remainingMs: 0, reason: null };
  if (isQueued) {
    cooldown = { remainingMs: 30 * 60 * 1000, reason: "queued" };
  } else if (recentlyPlayedAt) {
    const remaining = recentlyPlayedAt + 30 * 60 * 1000 - Date.now();
    if (remaining > 0) cooldown = { remainingMs: remaining, reason: "played" };
  }

  return (
    <SongDetailClient
      venueId={venueId}
      venueDbId={venueDbId}
      track={track}
      dbSongId={dbSongId}
      playCount={playCount}
      inVenueList={inVenueList}
      isFavorite={isFavorite}
      tokenBalance={tokenBalance}
      cooldown={cooldown}
      initialQueueEntries={queueEntries.map((e) => ({ song_id: e.song_id, priority: e.priority, duration_ms: e.songs?.duration_ms ?? 0 }))}
      initialNowPlaying={np ? { songId: np.song_id, progress_ms: np.progress_ms ?? 0, is_playing: np.is_playing, duration_ms: np.songs?.duration_ms ?? 0 } : null}
    />
  );
}
