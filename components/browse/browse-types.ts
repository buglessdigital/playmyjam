export type QueueEntry = {
  priority: boolean;
  duration_ms: number;
};

export type BrowseUserState = {
  queued_song_ids: string[];
  recently_played: { song_id: string; played_at: number }[];
  playing: { song_id: string; started_at: number } | null;
  token_balance: number;
  favorite_ids: string[];
  queue_entries: QueueEntry[];
  now_playing: { progress_ms: number; is_playing: boolean; duration_ms: number } | null;
};

export type VenueSong = {
  id: string;
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  play_count: number;
  in_venue_list: boolean;
};

export type DisplaySong = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  id?: string;
  play_count?: number;
  in_venue_list?: boolean;
};

export const COOLDOWN_MS = 30 * 60 * 1000;

export type SongActionState =
  | { kind: "cooldown"; mins: number }
  | { kind: "add" }
  | { kind: "added" }
  | { kind: "request" }
  | { kind: "requested" };

export type SongActionContext = {
  queuedSongIds: Set<string>;
  recentlyPlayedAt: Map<string, number>;
  addedIds: Set<string>;
  requestedIds: Set<string>;
};

export function getCooldown(
  song: DisplaySong,
  ctx: Pick<SongActionContext, "queuedSongIds" | "recentlyPlayedAt">
): { remainingMs: number; reason: "queued" | "played" | null } {
  if (song.id && ctx.queuedSongIds.has(song.id)) return { remainingMs: COOLDOWN_MS, reason: "queued" };
  if (song.id) {
    const playedAt = ctx.recentlyPlayedAt.get(song.id);
    if (playedAt) {
      const remaining = playedAt + COOLDOWN_MS - Date.now();
      if (remaining > 0) return { remainingMs: remaining, reason: "played" };
    }
  }
  return { remainingMs: 0, reason: null };
}

// Satır/kart aksiyonunun tek karar noktası: cooldown > eklendi > ekle;
// mekan listesinde olmayan şarkılar için istek akışı
export function getSongActionState(song: DisplaySong, ctx: SongActionContext): SongActionState {
  if (song.in_venue_list === true) {
    const cd = getCooldown(song, ctx);
    if (cd.remainingMs > 0) return { kind: "cooldown", mins: Math.ceil(cd.remainingMs / 60000) };
    return ctx.addedIds.has(song.spotify_track_id) ? { kind: "added" } : { kind: "add" };
  }
  return ctx.requestedIds.has(song.spotify_track_id) ? { kind: "requested" } : { kind: "request" };
}

export function actionStatesEqual(a: SongActionState, b: SongActionState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "cooldown" && b.kind === "cooldown") return a.mins === b.mins;
  return true;
}

export function primaryArtist(artist: string): string {
  return artist.split(",")[0].trim();
}

export function artistKey(artist: string): string {
  return primaryArtist(artist).toLocaleLowerCase("tr");
}
