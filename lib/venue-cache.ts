import { cacheLife, cacheTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

type VenueRow = { id: string; name: string; request_cost: number; priority_cost: number };

export type VenueListItem = { slug: string; name: string; tagline: string | null };

// Ana sayfadaki "Mekanlar" listesi — super admin mekan ekleyince/düzenleyince
// "venues-list" tag'i revalidate edilir, aksi halde dakikalar içinde tazelenir.
export async function getActiveVenues(): Promise<VenueListItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("venues-list");

  const { data } = await supabaseAdmin
    .from("venues")
    .select("slug, name, tagline")
    .eq("status", "active")
    .order("name");

  return (data ?? []) as VenueListItem[];
}

export async function getVenueBySlug(slug: string): Promise<VenueRow | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`venue-${slug}`);

  const { data } = await supabaseAdmin
    .from("venues")
    .select("id, name, request_cost, priority_cost")
    .eq("slug", slug)
    .single();
  return data ?? null;
}

export type VenueCatalogSong = {
  id: string;
  youtube_video_id: string;
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
  songs: { id: string; youtube_video_id: string; title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

// Şarkı kataloğu sık değişmez (sadece admin ekleme/çıkarma yapınca) — canlı play_count/queue
// güncellemeleri zaten client tarafında realtime ile geliyor, bu yüzden önbelleklenebilir.
export async function getVenueSongCatalog(venueDbId: string): Promise<VenueCatalogSong[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`venue-songs-${venueDbId}`);

  const { data } = await supabaseAdmin
    .from("venue_songs")
    .select("play_count, in_venue_list, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
    .eq("venue_id", venueDbId);

  const rows = (data ?? []) as unknown as VenueSongRow[];
  return rows
    .filter((vs) => vs.songs)
    .map((vs) => ({ ...vs.songs!, play_count: vs.play_count, in_venue_list: vs.in_venue_list }));
}

