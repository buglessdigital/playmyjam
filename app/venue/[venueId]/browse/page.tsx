import { createClient } from "@/lib/supabase/server";
import { getVenueBySlug } from "@/lib/venue-cache";
import BrowseClient from "./BrowseClient";

interface Props {
  params: Promise<{ venueId: string }>;
}

type VenueSongRow = {
  play_count: number;
  in_venue_list: boolean;
  songs: { id: string; spotify_track_id: string; title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

export default async function BrowsePage({ params }: Props) {
  const { venueId } = await params;
  const supabase = await createClient();

  const [venue, userRes] = await Promise.all([
    getVenueBySlug(supabase, venueId),
    supabase.auth.getUser(),
  ]);

  const user = userRes.data.user;

  if (!venue) {
    return <BrowseClient
      venueId={venueId}
      venueDbId=""
      initialVenueSongs={[]}
      initialQueuedSongIds={[]}
      initialRecentlyPlayed={[]}
      initialTokenBalance={0}
      initialFavoriteIds={[]}
    />;
  }

  const cooldownSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const [vSongsRes, queueRes, playedRes, nowPlayingRes, tokensRes, favsRes] = await Promise.all([
    supabase
      .from("venue_songs")
      .select("play_count, in_venue_list, songs(id, spotify_track_id, title, artist, album_cover_url, duration_ms)")
      .eq("venue_id", venue.id),
    supabase
      .from("queue")
      .select("song_id")
      .eq("venue_id", venue.id)
      .eq("status", "queued")
      .not("user_id", "is", null),
    supabase
      .from("queue")
      .select("song_id, played_at")
      .eq("venue_id", venue.id)
      .eq("status", "played")
      .not("user_id", "is", null)
      .gte("played_at", cooldownSince),
    supabase
      .from("queue")
      .select("song_id, added_at")
      .eq("venue_id", venue.id)
      .eq("status", "playing")
      .not("user_id", "is", null)
      .maybeSingle(),
    user
      ? supabase.from("user_tokens").select("balance").eq("user_id", user.id).eq("venue_id", venue.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("user_favorites").select("song_id").eq("user_id", user.id)
      : Promise.resolve({ data: null }),
  ]);

  const rows = (vSongsRes.data ?? []) as unknown as VenueSongRow[];
  const initialVenueSongs = rows
    .filter((vs) => vs.songs)
    .map((vs) => ({ ...vs.songs!, play_count: vs.play_count, in_venue_list: vs.in_venue_list }));

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
      venueDbId={venue.id}
      initialVenueSongs={initialVenueSongs}
      initialQueuedSongIds={initialQueuedSongIds}
      initialRecentlyPlayed={recentlyPlayedMap}
      initialTokenBalance={initialTokenBalance}
      initialFavoriteIds={initialFavoriteIds}
    />
  );
}
