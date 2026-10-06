import { cacheLife, cacheTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isPlayerOnline } from "@/lib/player-status";
import { genreShares, type GenreShare } from "@/lib/genres";
import { fillArtistGenres, readArtistGenres, artistKey } from "@/lib/artist-genre";
import { runInBackground } from "@/lib/background";

// Müşteri panelindeki "Mekanlar" haritası (bkz. 0073).

export type MapVenue = {
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  lat: number;
  lng: number;
};

// Haritadaki iğneler. Koordinatı olmayan mekan görünmez — test mekanları da
// böylece dışarıda kalır. Super admin mekanı düzenleyince "venues-list"
// tag'i zaten revalidate ediliyor.
export async function getMapVenues(): Promise<MapVenue[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("venues-list");

  const { data } = await supabaseAdmin
    .from("venues")
    .select("slug, name, tagline, logo_url, latitude, longitude")
    .eq("status", "active")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("name");

  return ((data ?? []) as {
    slug: string;
    name: string;
    tagline: string | null;
    logo_url: string | null;
    latitude: number;
    longitude: number;
  }[]).map((v) => ({
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    logo_url: v.logo_url,
    lat: v.latitude,
    lng: v.longitude,
  }));
}

export type MapSong = { title: string; artist: string; cover: string | null };

export type VenueMapCard = {
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  /** Mekanın Google Maps linki; yoksa koordinata yol tarifi */
  directions_url: string;
  /** Oynatıcı açık ve çalıyorsa şu an çalan; değilse null */
  nowPlaying: MapSong | null;
  online: boolean;
  upNext: (MapSong & { priority: boolean })[];
  topSongs: (MapSong & { plays: number })[];
  /** Tür aileleri, en büyük pay önce (bkz. lib/genres.ts) */
  genres: GenreShare[];
  /** İstatistiğin kapsadığı gün sayısı ve toplam çalma */
  days: number;
  totalPlays: number;
};

const STATS_DAYS = 90;
const UP_NEXT = 10;
/** Kart açılırken en fazla bu kadar sanatçının türü iTunes'tan beklenir */
const SYNC_GENRE_LOOKUPS = 8;
/** Arka planda bir kartta en fazla bu kadar sanatçıya bakılır (iTunes ~20 istek/dk) */
const BACKGROUND_GENRE_LOOKUPS = 12;

type SongJoin = { title: string; artist: string; album_cover_url: string | null } | null;

function toSong(s: SongJoin): MapSong | null {
  return s ? { title: s.title, artist: s.artist, cover: s.album_cover_url } : null;
}

export async function getVenueMapCard(slug: string): Promise<VenueMapCard | null> {
  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id, slug, name, tagline, logo_url, maps_url, status, latitude, longitude")
    .eq("slug", slug)
    .maybeSingle();
  // Haritada görünmeyen mekanın kartı da yok
  if (!venue || venue.status !== "active" || venue.latitude == null) return null;

  const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [npRes, queueRes, statsRes] = await Promise.all([
    supabaseAdmin
      .from("now_playing")
      .select("is_playing, last_heartbeat_at, songs(title, artist, album_cover_url)")
      .eq("venue_id", venue.id)
      .maybeSingle(),
    supabaseAdmin
      .from("queue")
      .select("priority, songs(title, artist, album_cover_url)")
      .eq("venue_id", venue.id)
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("position", { ascending: true })
      .order("added_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(UP_NEXT),
    supabaseAdmin.rpc("venue_top_played", { p_venue_id: venue.id, p_since: since }),
  ]);

  const np = npRes.data as { is_playing: boolean; last_heartbeat_at: string | null; songs: SongJoin } | null;
  const online = isPlayerOnline(np?.last_heartbeat_at);
  const nowPlaying = online && np?.is_playing ? toSong(np.songs) : null;

  const upNext = ((queueRes.data ?? []) as unknown as { priority: boolean | null; songs: SongJoin }[])
    .map((r) => {
      const song = toSong(r.songs);
      return song ? { ...song, priority: r.priority === true } : null;
    })
    .filter((r): r is MapSong & { priority: boolean } => r !== null);

  const stats = (statsRes.data ?? { total: 0, songs: [], artists: [] }) as {
    total: number;
    songs: { title: string; artist: string; album_cover_url: string | null; plays: number }[];
    artists: { artist: string; plays: number }[];
  };

  const topSongs = stats.songs.map((s) => ({
    title: s.title,
    artist: s.artist,
    cover: s.album_cover_url,
    plays: s.plays,
  }));

  const genres = await venueGenres(stats.artists);

  return {
    slug: venue.slug,
    name: venue.name,
    tagline: venue.tagline,
    logo_url: venue.logo_url,
    directions_url:
      venue.maps_url ||
      `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`,
    nowPlaying,
    online,
    upNext,
    topSongs,
    genres,
    days: STATS_DAYS,
    totalPlays: stats.total,
  };
}

// Türü bilinmeyen sanatçılar iTunes'tan öğrenilir. Kartın ilk açılışında tür
// hiç bilinmiyorsa en çok çalınan birkaçı beklenir (boş "tür" alanı
// göstermemek için); geri kalanı yanıttan sonra arka planda tamamlanır.
async function venueGenres(artists: { artist: string; plays: number }[]): Promise<GenreShare[]> {
  if (artists.length === 0) return [];
  const { genres, stale } = await readArtistGenres(artists.map((a) => a.artist));

  const withGenre = () =>
    artists.map((a) => ({ plays: a.plays, genre: genres.get(artistKey(a.artist)) }));

  let result = genreShares(withGenre());
  if (stale.length === 0) return result.shares;

  let rest = stale;
  if (result.coverage < 0.5) {
    const learned = await fillArtistGenres(stale.slice(0, SYNC_GENRE_LOOKUPS));
    for (const [k, g] of learned) genres.set(k, g);
    result = genreShares(withGenre());
    rest = stale.slice(SYNC_GENRE_LOOKUPS);
  }
  if (rest.length) {
    const batch = rest.slice(0, BACKGROUND_GENRE_LOOKUPS);
    runInBackground(async () => {
      await fillArtistGenres(batch);
    });
  }
  return result.shares;
}
