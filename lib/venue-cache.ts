import { cacheLife, cacheTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type VenueRow = { id: string; name: string; request_cost: number; priority_cost: number };

export type VenueListItem = { slug: string; name: string; tagline: string | null; logo_url: string | null };

// Ana sayfadaki "Mekanlar" listesi — super admin mekan ekleyince/düzenleyince
// "venues-list" tag'i revalidate edilir, aksi halde dakikalar içinde tazelenir.
export async function getActiveVenues(): Promise<VenueListItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("venues-list");

  const { data } = await supabaseAdmin
    .from("venues")
    .select("slug, name, tagline, logo_url")
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

export type VenueBranding = { name: string; logo_url: string | null };

// Mekanın kurulabilir panel uygulaması (PWA) için adı ve logosu. Manifest ve
// ikon route'ları her istekte veritabanına gitmesin diye ayrı tutulur; logo
// yüklenince "venue-<slug>" tag'i zaten revalidate ediliyor (api/admin/logo).
export async function getVenueBranding(slug: string): Promise<VenueBranding | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`venue-${slug}`);

  const { data } = await supabaseAdmin
    .from("venues")
    .select("name, logo_url")
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
  // 0040: şarkı en az bir "müşteriye aktif" playlist'te mi (materyalize)
  playlist_visible: boolean;
  songs: { id: string; youtube_video_id: string; title: string; artist: string; album_cover_url: string; duration_ms: number } | null;
};

// Şarkı kataloğu sık değişmez (sadece admin ekleme/çıkarma yapınca) — canlı play_count/queue
// güncellemeleri zaten client tarafında realtime ile geliyor, bu yüzden önbelleklenebilir.
export async function getVenueSongCatalog(venueDbId: string): Promise<VenueCatalogSong[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`venue-songs-${venueDbId}`);

  // Sayfalı: 1000'den fazla şarkısı olan mekanlarda katalogun kuyruğu kesiliyordu
  const { data } = await fetchAllRows<VenueSongRow>((from, to) =>
    supabaseAdmin
      .from("venue_songs")
      .select("play_count, in_venue_list, playlist_visible, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)")
      .eq("venue_id", venueDbId)
      .order("song_id", { ascending: true })
      .range(from, to)
  );

  const rows = data;
  // Müşteri açısından "seçilebilir mi": adminin tek tek gizlemesi (in_venue_list)
  // ve listenin müşteriye aktifliği (playlist_visible) birlikte karar verir (0040).
  return rows
    .filter((vs) => vs.songs)
    .map((vs) => ({
      ...vs.songs!,
      play_count: vs.play_count,
      in_venue_list: vs.in_venue_list && vs.playlist_visible,
    }));
}

