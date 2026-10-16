import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { attachSongsToPlaylist, type AttachableSong } from "@/lib/playlist";
import { findInPool } from "@/lib/request-approval";
import { getVideoDetails, YouTubeQuotaError } from "@/lib/youtube";
import { parseVideoId } from "@/lib/youtube-parse";
import type { ImportRow } from "@/lib/pmj-import";

// PMJ listeleri (0081): PMJ'nin hazırladığı ortak listeler. Mekan bir listeyi
// açınca kendi `playlists` tablosuna PMJ'ye bağlı bir satır yazılır ve şarkılar
// oraya üye olur — müşteri kataloğu, görünürlük ve katalog temizliği mevcut
// trigger'larla çalışır. Liste kapatılınca satır silinir.
//
// ABONELİK: PMJ listesi değişince açan her mekanın bağlı satırı aynı içeriğe
// getirilir (syncSubscribers). Bağlı satır otomatik çalmaya girmez:
// queue_position hep null, katalog yedeği de venue_songs.autoplay_ok'a bakar.

export const PMJ_NAME_MAX = 40;

export type PmjSong = {
  id: string;
  youtube_video_id: string;
  title: string;
  artist: string;
  channel_title: string | null;
  duration_ms: number;
  album_cover_url: string | null;
};

export type PmjPlaylistSummary = {
  id: string;
  name: string;
  sort_order: number;
  song_count: number;
  venue_count: number;
  updated_at: string;
};

const SONG_COLUMNS = "id, youtube_video_id, title, artist, channel_title, duration_ms, album_cover_url";

/* ---------- okuma ---------- */

export async function listPmjPlaylists(): Promise<PmjPlaylistSummary[]> {
  const [{ data: lists, error }, { data: members }, { data: links }] = await Promise.all([
    supabaseAdmin
      .from("pmj_playlists")
      .select("id, name, sort_order, updated_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    fetchAllRows<{ pmj_playlist_id: string }>((from, to) =>
      supabaseAdmin
        .from("pmj_playlist_songs")
        .select("pmj_playlist_id, song_id")
        .order("pmj_playlist_id")
        .order("song_id")
        .range(from, to)
    ),
    fetchAllRows<{ pmj_playlist_id: string }>((from, to) =>
      supabaseAdmin
        .from("playlists")
        .select("id, pmj_playlist_id")
        .not("pmj_playlist_id", "is", null)
        .order("id")
        .range(from, to)
    ),
  ]);
  if (error) throw new Error(error.message);

  const songCount = new Map<string, number>();
  for (const m of members) songCount.set(m.pmj_playlist_id, (songCount.get(m.pmj_playlist_id) ?? 0) + 1);
  const venueCount = new Map<string, number>();
  for (const l of links) venueCount.set(l.pmj_playlist_id, (venueCount.get(l.pmj_playlist_id) ?? 0) + 1);

  return (lists ?? []).map((l) => ({
    ...l,
    song_count: songCount.get(l.id) ?? 0,
    venue_count: venueCount.get(l.id) ?? 0,
  }));
}

export async function getPmjPlaylistSongs(pmjId: string): Promise<PmjSong[]> {
  const { data, error } = await fetchAllRows<{ position: number; songs: PmjSong | null }>((from, to) =>
    supabaseAdmin
      .from("pmj_playlist_songs")
      .select(`position, songs(${SONG_COLUMNS})`)
      .eq("pmj_playlist_id", pmjId)
      .order("position")
      .order("song_id")
      .range(from, to)
  );
  if (error) throw new Error(error.message);
  return data.filter((r) => r.songs).map((r) => r.songs!);
}

/* ---------- yazma ---------- */

async function touch(pmjId: string) {
  await supabaseAdmin.from("pmj_playlists").update({ updated_at: new Date().toISOString() }).eq("id", pmjId);
}

/**
 * Aynı adda liste varsa içeriğini VERİLEN şarkılarla değiştirir (Excel'in yeni
 * sürümü yüklendi), yoksa yeni liste açar. Sıra verilen sıradır. Ardından listeyi
 * açmış bütün mekanlar güncellenir.
 */
export async function savePmjPlaylist(
  name: string,
  songIds: string[]
): Promise<{ id: string; created: boolean; added: number; removed: number; venues: number }> {
  const clean = name.trim().slice(0, PMJ_NAME_MAX);
  if (!clean) throw new Error("Liste adı boş");
  const ids = [...new Set(songIds)];

  const { data: existing } = await supabaseAdmin
    .from("pmj_playlists")
    .select("id")
    .ilike("name", clean.replace(/[%_\\]/g, (c) => `\\${c}`))
    .maybeSingle();

  let id = existing?.id as string | undefined;
  const created = !id;
  if (!id) {
    const { data: last } = await supabaseAdmin
      .from("pmj_playlists")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await supabaseAdmin
      .from("pmj_playlists")
      .insert({ name: clean, sort_order: (last?.sort_order ?? -1) + 1 })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Liste açılamadı");
    id = row.id as string;
  }

  const { data: current } = await fetchAllRows<{ song_id: string }>((from, to) =>
    supabaseAdmin
      .from("pmj_playlist_songs")
      .select("song_id")
      .eq("pmj_playlist_id", id!)
      .order("song_id")
      .range(from, to)
  );
  const keep = new Set(ids);
  const toRemove = current.map((r) => r.song_id).filter((s) => !keep.has(s));
  const had = new Set(current.map((r) => r.song_id));

  for (let i = 0; i < toRemove.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("pmj_playlist_songs")
      .delete()
      .eq("pmj_playlist_id", id)
      .in("song_id", toRemove.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  // Sıra her kayıtta baştan yazılır: Excel'deki sıra listenin sırasıdır
  const rows = ids.map((songId, i) => ({ pmj_playlist_id: id!, song_id: songId, position: i + 1 }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("pmj_playlist_songs")
      .upsert(rows.slice(i, i + 500), { onConflict: "pmj_playlist_id,song_id" });
    if (error) throw new Error(error.message);
  }

  await touch(id);
  const venues = await syncSubscribers(id);
  return { id, created, added: ids.filter((s) => !had.has(s)).length, removed: toRemove.length, venues };
}

export async function renamePmjPlaylist(pmjId: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, PMJ_NAME_MAX);
  if (!clean) throw new Error("Liste adı boş");
  const { error } = await supabaseAdmin
    .from("pmj_playlists")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", pmjId);
  if (error) {
    throw new Error(error.code === "23505" ? "Bu adda bir PMJ listesi zaten var" : error.message);
  }
  await supabaseAdmin.from("playlists").update({ name: clean }).eq("pmj_playlist_id", pmjId);
}

export async function removeSongFromPmjPlaylist(pmjId: string, songId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("pmj_playlist_songs")
    .delete()
    .eq("pmj_playlist_id", pmjId)
    .eq("song_id", songId);
  if (error) throw new Error(error.message);
  await touch(pmjId);
  await syncSubscribers(pmjId);
}

/** Listeyi siler; açan mekanlardaki bağlı satırlar cascade ile gider. */
export async function deletePmjPlaylist(pmjId: string): Promise<number> {
  const { data: linked } = await supabaseAdmin
    .from("playlists")
    .select("venue_id")
    .eq("pmj_playlist_id", pmjId);
  const { error } = await supabaseAdmin.from("pmj_playlists").delete().eq("id", pmjId);
  if (error) throw new Error(error.message);
  const venues = new Set((linked ?? []).map((l) => l.venue_id as string));
  for (const venueId of venues) revalidateTag(`venue-songs-${venueId}`, "max");
  return venues.size;
}

/* ---------- abonelik ---------- */

async function pmjSongsForAttach(pmjId: string): Promise<AttachableSong[]> {
  const songs = await getPmjPlaylistSongs(pmjId);
  return songs.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    channel_title: s.channel_title,
    duration_ms: s.duration_ms,
  }));
}

// Bağlı satırı PMJ listesinin güncel içeriğine getirir: eksikler eklenir,
// listeden çıkarılanlar düşer (0026 trigger'ı yalnızca başka listede olmayanları
// katalogdan siler).
async function syncLinkedPlaylist(venueId: string, playlistId: string, songs: AttachableSong[]) {
  const { data: current } = await fetchAllRows<{ song_id: string }>((from, to) =>
    supabaseAdmin
      .from("playlist_songs")
      .select("song_id")
      .eq("playlist_id", playlistId)
      .order("song_id")
      .range(from, to)
  );
  const want = new Set(songs.map((s) => s.id));
  const have = new Set(current.map((r) => r.song_id));
  const toRemove = [...have].filter((id) => !want.has(id));
  const toAdd = songs.filter((s) => !have.has(s.id));

  for (let i = 0; i < toRemove.length; i += 200) {
    await supabaseAdmin
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", playlistId)
      .in("song_id", toRemove.slice(i, i + 200));
  }
  if (toAdd.length > 0) await attachSongsToPlaylist(venueId, playlistId, toAdd);
  if (toRemove.length > 0) revalidateTag(`venue-songs-${venueId}`, "max");
}

/** PMJ listesini açmış bütün mekanları günceller. Dönen sayı mekan sayısıdır. */
export async function syncSubscribers(pmjId: string): Promise<number> {
  const { data: linked } = await supabaseAdmin
    .from("playlists")
    .select("id, venue_id")
    .eq("pmj_playlist_id", pmjId);
  if (!linked?.length) return 0;
  const songs = await pmjSongsForAttach(pmjId);
  for (const link of linked) {
    await syncLinkedPlaylist(link.venue_id as string, link.id as string, songs);
  }
  return linked.length;
}

export type VenuePmjPlaylist = { id: string; name: string; song_count: number; visible: boolean };

export async function listPmjPlaylistsForVenue(venueId: string): Promise<VenuePmjPlaylist[]> {
  const [lists, { data: mine }] = await Promise.all([
    listPmjPlaylists(),
    supabaseAdmin.from("playlists").select("pmj_playlist_id").eq("venue_id", venueId).not("pmj_playlist_id", "is", null),
  ]);
  const open = new Set((mine ?? []).map((m) => m.pmj_playlist_id as string));
  return lists
    .filter((l) => l.song_count > 0)
    .map((l) => ({ id: l.id, name: l.name, song_count: l.song_count, visible: open.has(l.id) }));
}

/**
 * Mekanda PMJ listesini müşteriye açar (visible=true) ya da kapatır. Açmak bağlı
 * playlist satırını kurar; kapatmak siler — yalnızca o listeden gelen şarkılar
 * katalogdan düşer.
 */
export async function setVenuePmjPlaylist(venueId: string, pmjId: string, visible: boolean): Promise<void> {
  if (!visible) {
    const { error } = await supabaseAdmin
      .from("playlists")
      .delete()
      .eq("venue_id", venueId)
      .eq("pmj_playlist_id", pmjId);
    if (error) throw new Error(error.message);
    revalidateTag(`venue-songs-${venueId}`, "max");
    return;
  }

  const { data: pmj } = await supabaseAdmin.from("pmj_playlists").select("id, name").eq("id", pmjId).maybeSingle();
  if (!pmj) throw new Error("PMJ listesi bulunamadı");

  let { data: link } = await supabaseAdmin
    .from("playlists")
    .select("id")
    .eq("venue_id", venueId)
    .eq("pmj_playlist_id", pmjId)
    .maybeSingle();

  if (!link) {
    // queue_position null: otomatik çalmaya hiç girmez. customer_visible true:
    // listenin varlık sebebi müşterinin görmesi.
    const { data: created, error } = await supabaseAdmin
      .from("playlists")
      .insert({
        venue_id: venueId,
        name: pmj.name,
        is_active: false,
        sort_order: 100_000,
        queue_position: null,
        customer_visible: true,
        pmj_playlist_id: pmjId,
      })
      .select("id")
      .single();
    // Aynı anda iki tık: eşsiz indeks ikinciyi reddeder, var olanla devam edilir
    if (error?.code === "23505") {
      ({ data: link } = await supabaseAdmin
        .from("playlists")
        .select("id")
        .eq("venue_id", venueId)
        .eq("pmj_playlist_id", pmjId)
        .maybeSingle());
    } else if (error || !created) {
      throw new Error(error?.message ?? "Liste açılamadı");
    } else {
      link = created;
    }
  }
  if (!link) throw new Error("Liste açılamadı");

  await syncLinkedPlaylist(venueId, link.id as string, await pmjSongsForAttach(pmjId));
  revalidateTag(`venue-songs-${venueId}`, "max");
}

/* ---------- içe aktarım: satırları havuzdaki şarkılara bağlama ---------- */

export type ResolvedRow = ImportRow & {
  status: "ok" | "not_found" | "unplayable" | "bad_link";
  via?: "link" | "match";
  song?: PmjSong;
};

async function songsByVideoIds(videoIds: string[]): Promise<Map<string, PmjSong>> {
  const map = new Map<string, PmjSong>();
  for (let i = 0; i < videoIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select(`${SONG_COLUMNS}, embeddable`)
      .in("youtube_video_id", videoIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const s of data ?? []) {
      if ((s as { embeddable?: boolean }).embeddable === false) continue;
      map.set(s.youtube_video_id as string, s as unknown as PmjSong);
    }
  }
  return map;
}

// Havuzda olmayan linkli şarkılar YouTube'dan okunup havuza yazılır (50 video
// = 1 birim). Kategori kuralı burada yok: liste elle seçildi, "Kişiler ve
// Bloglar" kategorisinde yüklenmiş gerçek klipler de girmeli. Gömülemeyen ya da
// süresi dışı videoları getVideoDetails zaten eler.
async function ingestVideos(videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return;
  const tracks = await getVideoDetails(videoIds);
  if (tracks.length === 0) return;
  const { error } = await supabaseAdmin.from("songs").upsert(
    tracks.map((t) => ({
      youtube_video_id: t.youtube_video_id,
      title: t.title,
      artist: t.artist,
      album_cover_url: t.album_cover_url,
      duration_ms: t.duration_ms,
      channel_title: t.channel_title,
      view_count: t.view_count,
    })),
    { onConflict: "youtube_video_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

/** Excel satırlarını havuzdaki şarkılara bağlar. Linkli satır birebir, linksiz satır ad+sanatçıyla. */
export async function resolveImportRows(rows: ImportRow[]): Promise<{ rows: ResolvedRow[]; quotaHit: boolean }> {
  const idOf = new Map<ImportRow, string | null>();
  for (const r of rows) idOf.set(r, r.link ? parseVideoId(r.link) : null);

  const linked = [...new Set([...idOf.values()].filter((v): v is string => !!v))];
  let known = await songsByVideoIds(linked);
  let quotaHit = false;
  const missing = linked.filter((v) => !known.has(v));
  if (missing.length > 0) {
    try {
      await ingestVideos(missing);
    } catch (err) {
      if (err instanceof YouTubeQuotaError) quotaHit = true;
      else throw err;
    }
    known = await songsByVideoIds(linked);
  }

  const resolved = await mapLimit(rows, 8, async (row): Promise<ResolvedRow> => {
    const videoId = idOf.get(row);
    if (row.link && !videoId) return { ...row, status: "bad_link" };
    if (videoId) {
      const song = known.get(videoId);
      return song ? { ...row, status: "ok", via: "link", song } : { ...row, status: "unplayable", via: "link" };
    }
    const hit = await findInPool(row.title, row.artist).catch(() => null);
    if (!hit) return { ...row, status: "not_found" };
    const song = (await songsByVideoIds([hit.youtube_video_id])).get(hit.youtube_video_id);
    return song ? { ...row, status: "ok", via: "match", song } : { ...row, status: "not_found" };
  });

  return { rows: resolved, quotaHit };
}
