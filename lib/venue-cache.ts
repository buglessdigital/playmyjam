import { cacheLife, cacheTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

type VenueRow = { id: string; name: string };

export async function getVenueBySlug(slug: string): Promise<VenueRow | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`venue-${slug}`);

  const { data } = await supabaseAdmin.from("venues").select("id, name").eq("slug", slug).single();
  return data ?? null;
}

export type VenueCatalogSong = {
  id: string;
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  play_count: number;
  in_venue_list: boolean;
};

type VenueSongRow = {
  play_count: number;
  in_venue_list: boolean;
  songs: { id: string; spotify_track_id: string; title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

// Şarkı kataloğu sık değişmez (sadece admin ekleme/çıkarma yapınca) — canlı play_count/queue
// güncellemeleri zaten client tarafında realtime ile geliyor, bu yüzden önbelleklenebilir.
export async function getVenueSongCatalog(venueDbId: string): Promise<VenueCatalogSong[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`venue-songs-${venueDbId}`);

  const { data } = await supabaseAdmin
    .from("venue_songs")
    .select("play_count, in_venue_list, songs(id, spotify_track_id, title, artist, album_cover_url, duration_ms)")
    .eq("venue_id", venueDbId);

  const rows = (data ?? []) as unknown as VenueSongRow[];
  return rows
    .filter((vs) => vs.songs)
    .map((vs) => ({ ...vs.songs!, play_count: vs.play_count, in_venue_list: vs.in_venue_list }));
}
