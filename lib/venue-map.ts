import { cacheLife, cacheTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isPlayerOnline } from "@/lib/player-status";
import { genreShares, type GenreShare } from "@/lib/genres";
import { fillSongGenres, type SongForGenre } from "@/lib/song-genre";
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
  /** En çok çalınan şarkıların kapsadığı gün sayısı ve toplam çalma */
  days: number;
  /** Tür paylarının kapsadığı gün sayısı */
  genreDays: number;
  totalPlays: number;
};

const STATS_DAYS = 90;
/** Tür payı son 30 günün çalmalarından: her çalma şarkısının türüne bir sayılır */
const GENRE_DAYS = 30;
const UP_NEXT = 10;
/** Kart açılırken en fazla bu kadar şarkının türü iTunes'tan beklenir */
const SYNC_GENRE_LOOKUPS = 8;
/** Arka planda bir kartta en fazla bu kadar şarkıya bakılır (iTunes ~20 istek/dk);
 *  kalanı /api/cron/song-genres doldurur */
const BACKGROUND_GENRE_LOOKUPS = 12;

type SongJoin = { title: string; artist: string; album_cover_url: string | null } | null;

function toSong(s: SongJoin): MapSong | null {
  return s ? { title: s.title, artist: s.artist, cover: s.album_cover_url } : null;
}

// Aynı mekanın kartı aynı anda çok kişi tarafından istenirse (QR'ı okutan
// kalabalık) bir kez hesaplanıp paylaşılır. Fluid Compute bir örneği eşzamanlı
// isteklere kullandığı için bu, CDN'in önündeki ilk dalgayı tek sorguya indirir.
// Yük testinde (scripts/load-map.ts) 100 eşzamanlı ilk açılış bu olmadan her
// biri ayrı iTunes araması yapıp 2,6-3,9 sn bekliyordu.
const CARD_SHARE_MS = 5_000;
const inflight = new Map<string, { at: number; card: Promise<VenueMapCard | null> }>();

export function getVenueMapCard(slug: string): Promise<VenueMapCard | null> {
  const now = Date.now();
  const hit = inflight.get(slug);
  if (hit && now - hit.at < CARD_SHARE_MS) return hit.card;

  const card = buildVenueMapCard(slug).catch((err) => {
    inflight.delete(slug); // hata paylaşılmasın, sonraki istek yeniden denesin
    throw err;
  });
  inflight.set(slug, { at: now, card });
  // Eski girdiler birikmesin (mekan sayısı kadar, ama yine de)
  if (inflight.size > 500) {
    for (const [k, v] of inflight) if (now - v.at >= CARD_SHARE_MS) inflight.delete(k);
  }
  return card;
}

async function buildVenueMapCard(slug: string): Promise<VenueMapCard | null> {
  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id, slug, name, tagline, logo_url, maps_url, status, latitude, longitude")
    .eq("slug", slug)
    .maybeSingle();
  // Haritada görünmeyen mekanın kartı da yok
  if (!venue || venue.status !== "active" || venue.latitude == null) return null;

  const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const genreSince = new Date(Date.now() - GENRE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [npRes, queueRes, statsRes, genreRes] = await Promise.all([
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
    supabaseAdmin.rpc("venue_top_played", { p_venue_id: venue.id, p_since: since, p_artists: 0 }),
    supabaseAdmin.rpc("venue_genre_plays", { p_venue_id: venue.id, p_since: genreSince }),
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

  const stats = (statsRes.data ?? { total: 0, songs: [] }) as {
    total: number;
    songs: { title: string; artist: string; album_cover_url: string | null; plays: number }[];
  };

  const topSongs = stats.songs.map((s) => ({
    title: s.title,
    artist: s.artist,
    cover: s.album_cover_url,
    plays: s.plays,
  }));

  // 0079 yoksa RPC hata verir: tür alanı boş kalır, kartın geri kalanı çalışır
  const genres = await venueGenres((genreRes.data ?? { total: 0, genres: [], missing: [] }) as GenrePlays);

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
    genreDays: GENRE_DAYS,
    totalPlays: stats.total,
  };
}

type GenrePlays = {
  total: number;
  /** Ham iTunes türü başına çalma sayısı */
  genres: { genre: string; plays: number }[];
  /** Türü henüz bilinmeyen şarkılar, en çok çalınan önce */
  missing: (SongForGenre & { plays: number })[];
};

// Türü bilinmeyen şarkılar iTunes'tan öğrenilir. Bilinen pay yarının altındaysa
// en çok çalınan birkaçı beklenir (boş "tür" alanı göstermemek için); birkaçı
// daha yanıttan sonra arka planda, geri kalanı cron'da tamamlanır.
async function venueGenres(stats: GenrePlays): Promise<GenreShare[]> {
  if (stats.total === 0) return [];

  const rows = (): { plays: number; genre: string | null }[] => {
    const known = stats.genres.reduce((n, g) => n + g.plays, 0);
    return [...stats.genres, { plays: stats.total - known, genre: null }];
  };

  let result = genreShares(rows());
  let rest = stats.missing;
  if (rest.length === 0) return result.shares;

  if (result.coverage < 0.5) {
    const learned = await fillSongGenres(rest.slice(0, SYNC_GENRE_LOOKUPS));
    for (const song of rest.slice(0, SYNC_GENRE_LOOKUPS)) {
      const genre = learned.get(song.id);
      if (genre) stats.genres.push({ genre, plays: song.plays });
    }
    result = genreShares(rows());
    rest = rest.slice(SYNC_GENRE_LOOKUPS);
  }
  if (rest.length) {
    const batch = rest.slice(0, BACKGROUND_GENRE_LOOKUPS);
    runInBackground(async () => {
      await fillSongGenres(batch);
    });
  }
  return result.shares;
}
