import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SongInput } from "@/lib/validate";

// songs'a upsert edip venue playlist'ine ekler; admin playlist ve requests rotaları kullanır
export async function addSongToVenuePlaylist(
  venueId: string,
  song: SongInput
): Promise<{ venueSongId: string; songId: string } | { error: string; status: number }> {
  const { data: songRow, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(
      {
        spotify_track_id: song.spotify_track_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url,
        duration_ms: song.duration_ms,
      },
      { onConflict: "spotify_track_id" }
    )
    .select("id")
    .single();

  if (songErr || !songRow) {
    return { error: songErr?.message ?? "Şarkı kaydedilemedi", status: 500 };
  }

  const { data: existing } = await supabaseAdmin
    .from("venue_songs")
    .select("id")
    .eq("venue_id", venueId)
    .eq("song_id", songRow.id)
    .maybeSingle();

  if (existing) {
    return { error: "Bu şarkı zaten playlist'te mevcut", status: 409 };
  }

  const { data: vs, error: vsErr } = await supabaseAdmin
    .from("venue_songs")
    .insert({ venue_id: venueId, song_id: songRow.id, play_count: 0, in_venue_list: true })
    .select("id")
    .single();

  if (vsErr || !vs) {
    return { error: vsErr?.message ?? "Playlist'e eklenemedi", status: 500 };
  }

  return { venueSongId: vs.id, songId: songRow.id };
}
