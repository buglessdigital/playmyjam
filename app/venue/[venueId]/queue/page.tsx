import { createClient } from "@/lib/supabase/server";
import { getVenueBySlug } from "@/lib/venue-cache";
import QueueClient from "./QueueClient";

interface Props {
  params: Promise<{ venueId: string }>;
}

export default async function QueuePage({ params }: Props) {
  const { venueId } = await params;
  const supabase = await createClient();

  const venueRow = await getVenueBySlug(venueId);

  const initialVenueName = venueRow?.name ?? "";
  const initialVenueDbId = venueRow?.id ?? "";

  let initialNowPlaying = null;
  let initialQueue: unknown[] = [];

  if (venueRow) {
    const [npRes, queueRes] = await Promise.all([
      supabase
        .from("now_playing")
        .select("song_id, progress_ms, is_playing, started_at, songs(title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueRow.id)
        .single(),
      supabase
        .from("queue")
        .select("id, song_id, added_by, tokens_spent, priority, position, added_at, songs(title, artist, album_cover_url, duration_ms)")
        .eq("venue_id", venueRow.id)
        .eq("status", "queued")
        .order("priority", { ascending: false })
        .order("position", { ascending: true })
        .limit(10),
    ]);
    initialNowPlaying = npRes.data ?? null;
    initialQueue = queueRes.data ?? [];
  }

  return (
    <QueueClient
      venueId={venueId}
      initialVenueName={initialVenueName}
      initialVenueDbId={initialVenueDbId}
      initialNowPlaying={initialNowPlaying as never}
      initialQueue={initialQueue as never}
    />
  );
}
