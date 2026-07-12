import { supabaseAdmin } from "@/lib/supabase/admin";
import { fillQueueToTen } from "@/lib/queue-fill";
import { sendPushToUser } from "@/lib/push";

export type NextResult = {
  started: boolean;
  video_id?: string;
  song_id?: string;
  queueEmpty?: boolean;
  error?: string;
};

// Kuyruğu ilerletir: çalanı 'played' yapar, sıradakini seçip now_playing'e yazar.
// Oynatma artık admin cihazındaki gömülü player'da — burada yalnızca durum güncellenir,
// player now_playing'i Realtime ile dinleyip yeni videoyu yükler.
export async function playNextFromQueue(venueId: string, retryAfterFill = true): Promise<NextResult> {
  await supabaseAdmin
    .from("queue")
    .update({ status: "played", played_at: new Date().toISOString() })
    .eq("venue_id", venueId)
    .eq("status", "playing");

  const { data: nextItem } = await supabaseAdmin
    .from("queue")
    .select("id, song_id, user_id, songs(youtube_video_id, embeddable, title, artist, album_cover_url)")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextItem) {
    // Sıra boş yakalandıysa dolumu bekleyip bir kez daha dene — mekan listesinde
    // şarkı olduğu sürece "kuyruk boş" dönmemeli, çalma hiç durmamalı
    if (retryAfterFill) {
      await fillQueueToTen(venueId).catch(() => {});
      return playNextFromQueue(venueId, false);
    }
    await supabaseAdmin
      .from("now_playing")
      .update({ song_id: null, video_id: null, is_playing: false, progress_ms: 0 })
      .eq("venue_id", venueId);
    return { started: false, queueEmpty: true };
  }

  // Replenish queue after consuming a song — fire-and-forget
  fillQueueToTen(venueId).catch(() => {});

  type SongInfo = {
    youtube_video_id: string;
    embeddable: boolean;
    title: string;
    artist: string;
    album_cover_url: string | null;
  };
  const songRel = nextItem.songs as unknown as SongInfo | SongInfo[] | null;
  const song = Array.isArray(songRel) ? songRel[0] : songRel;
  if (!song?.youtube_video_id) return { started: false, error: "video_id yok" };

  // Daha önce çalınamadığı işaretlenen video — kuyruktan düş, sıradakini dene
  if (song.embeddable === false) {
    await supabaseAdmin.from("queue").update({ status: "removed" }).eq("id", nextItem.id);
    return playNextFromQueue(venueId);
  }

  await Promise.all([
    supabaseAdmin
      .from("now_playing")
      .update({
        song_id: nextItem.song_id,
        video_id: song.youtube_video_id,
        is_playing: true,
        progress_ms: 0,
        started_at: new Date().toISOString(),
      })
      .eq("venue_id", venueId),
    supabaseAdmin.from("queue").update({ status: "playing" }).eq("id", nextItem.id),
  ]);

  // Şarkının sahibine push: uygulama kapalıyken de "şarkın çalıyor" ulaşsın — fire-and-forget.
  // Venue sayfaları slug ile çözümlenir; bildirim URL'i için slug'ı çek.
  if (nextItem.user_id) {
    const ownerId = nextItem.user_id;
    (async () => {
      const { data: venue } = await supabaseAdmin
        .from("venues")
        .select("slug")
        .eq("id", venueId)
        .single();
      await sendPushToUser(ownerId, {
        title: "Şarkın çalıyor! 🎵",
        body: `${song.title} — ${song.artist} şu an sahnede`,
        icon: song.album_cover_url ?? undefined,
        url: venue?.slug ? `/venue/${venue.slug}/queue` : "/",
      });
    })().catch(() => {});
  }

  return { started: true, video_id: song.youtube_video_id, song_id: nextItem.song_id };
}

// Player onError (embed kapalı/bölge engelli/kaldırılmış) bildirdiğinde çağrılır:
// şarkı bir daha kuyruğa girmesin diye işaretlenir, kuyruk sıradakine ilerler.
export async function markUnplayableAndSkip(
  venueId: string,
  videoId: string
): Promise<NextResult> {
  await supabaseAdmin.from("songs").update({ embeddable: false }).eq("youtube_video_id", videoId);
  return playNextFromQueue(venueId);
}
