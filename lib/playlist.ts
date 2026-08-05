import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveMatchingSuggestions, type MatchableSong } from "@/lib/suggestions";
import type { SongInput } from "@/lib/validate";

export type PlaylistRow = {
  id: string;
  venue_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

// Hedef playlist belirtilmediğinde (ör. şarkı isteği kabul edilince) kullanılır:
// aktif olan ilk liste, yoksa en baştaki liste, o da yoksa yeni bir tane açılır.
// Mekanın hiç playlist'i olmaması yalnızca 0026 sonrası açılan mekanlarda olabilir.
export async function getDefaultPlaylistId(venueId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("playlists")
    .select("id, is_active")
    .eq("venue_id", venueId)
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data?.id) return data.id;

  const { data: created } = await supabaseAdmin
    .from("playlists")
    .insert({ venue_id: venueId, name: "Playlist 1", is_active: true, sort_order: 0 })
    .select("id")
    .single();

  return created?.id ?? null;
}

// Playlist'in gerçekten bu mekana ait olduğunu doğrular — istemciden gelen id'ye güvenilmez
export async function assertVenuePlaylist(venueId: string, playlistId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("playlists")
    .select("id")
    .eq("id", playlistId)
    .eq("venue_id", venueId)
    .maybeSingle();
  return !!data;
}

export type AttachableSong = MatchableSong;

// Hazır songs satırlarını topluca mekanın kataloguna + hedef playlist'e bağlar.
// Toplu içe aktarım (YouTube playlist) ve günlük otomatik senkron aynı yoldan
// geçsin diye ortak: "zaten var" ölçütü HEDEF LİSTEDEKİ üyeliktir — aynı şarkı
// başka bir listede duruyor olabilir, katalog satırı o zaman korunur (play_count
// kaybolmaz), yalnızca yeni üyelik açılır.
export async function attachSongsToPlaylist(
  venueId: string,
  playlistId: string,
  songs: AttachableSong[]
): Promise<{ added: number; skipped: number; resolvedSuggestions: number }> {
  if (songs.length === 0) return { added: 0, skipped: 0, resolvedSuggestions: 0 };

  const { data: existing } = await supabaseAdmin
    .from("playlist_songs")
    .select("song_id")
    .eq("playlist_id", playlistId)
    .in("song_id", songs.map((s) => s.id));

  const existingSet = new Set((existing ?? []).map((e) => e.song_id));
  const fresh = songs.filter((s) => !existingSet.has(s.id));
  if (fresh.length === 0) return { added: 0, skipped: songs.length, resolvedSuggestions: 0 };

  const { error: catalogErr } = await supabaseAdmin.from("venue_songs").upsert(
    fresh.map((s) => ({ venue_id: venueId, song_id: s.id, play_count: 0, in_venue_list: true })),
    { onConflict: "venue_id,song_id", ignoreDuplicates: true }
  );
  if (catalogErr) throw new Error(catalogErr.message);

  const { error: memberErr } = await supabaseAdmin.from("playlist_songs").upsert(
    fresh.map((s) => ({ venue_id: venueId, playlist_id: playlistId, song_id: s.id })),
    { onConflict: "playlist_id,song_id", ignoreDuplicates: true }
  );
  if (memberErr) throw new Error(memberErr.message);

  revalidateTag(`venue-songs-${venueId}`, "max");

  // Mekan, müşterinin serbest metin önerisini listesine eklemiş olabilir:
  // eşleşen bekleyen öneriler burada kendiliğinden kapanır
  const resolvedSuggestions = await resolveMatchingSuggestions(venueId, fresh).catch(() => 0);

  return { added: fresh.length, skipped: songs.length - fresh.length, resolvedSuggestions };
}

// songs'a upsert eder, mekan kataloguna (venue_songs) ve hedef playlist'e ekler.
// Katalog satırı zaten varsa korunur (play_count/in_venue_list kaybolmaz), yalnızca
// playlist üyeliği eklenir; şarkı o playlist'te zaten varsa 409 döner.
export async function addSongToVenuePlaylist(
  venueId: string,
  song: SongInput,
  playlistId?: string
): Promise<{ venueSongId: string; songId: string; playlistId: string } | { error: string; status: number }> {
  const targetPlaylistId = playlistId ?? (await getDefaultPlaylistId(venueId));
  if (!targetPlaylistId) {
    return { error: "Mekanın playlist'i bulunamadı", status: 500 };
  }

  const { data: songRow, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(
      {
        youtube_video_id: song.youtube_video_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url,
        duration_ms: song.duration_ms,
      },
      { onConflict: "youtube_video_id" }
    )
    .select("id")
    .single();

  if (songErr || !songRow) {
    return { error: songErr?.message ?? "Şarkı kaydedilemedi", status: 500 };
  }

  const { data: existingMember } = await supabaseAdmin
    .from("playlist_songs")
    .select("id")
    .eq("playlist_id", targetPlaylistId)
    .eq("song_id", songRow.id)
    .maybeSingle();

  if (existingMember) {
    return { error: "Bu şarkı zaten bu playlist'te mevcut", status: 409 };
  }

  // Katalog satırı: başka bir playlist üzerinden zaten varsa dokunma
  const { data: venueSong, error: vsErr } = await supabaseAdmin
    .from("venue_songs")
    .upsert(
      { venue_id: venueId, song_id: songRow.id, play_count: 0, in_venue_list: true },
      { onConflict: "venue_id,song_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (vsErr) {
    return { error: vsErr.message, status: 500 };
  }

  let venueSongId = venueSong?.id ?? "";
  if (!venueSongId) {
    const { data: existingVs } = await supabaseAdmin
      .from("venue_songs")
      .select("id")
      .eq("venue_id", venueId)
      .eq("song_id", songRow.id)
      .maybeSingle();
    if (!existingVs) {
      return { error: "Katalog satırı oluşturulamadı", status: 500 };
    }
    venueSongId = existingVs.id;
  }

  const { error: memberErr } = await supabaseAdmin
    .from("playlist_songs")
    .insert({ venue_id: venueId, playlist_id: targetPlaylistId, song_id: songRow.id });

  if (memberErr) {
    return { error: memberErr.message, status: 500 };
  }

  // Bu şarkıyı bekleyen serbest metin öneriler varsa kendiliğinden kapansın
  await resolveMatchingSuggestions(venueId, [
    { id: songRow.id, title: song.title, artist: song.artist },
  ]).catch(() => 0);

  return { venueSongId, songId: songRow.id, playlistId: targetPlaylistId };
}
