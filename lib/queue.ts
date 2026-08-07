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

// Arka arkaya kaç bozuk satır atlanabilir. Tavan yalnızca sonsuz özyinelemeye
// karşı emniyet; normalde kuyrukta bir iki bozuk satır olur.
const MAX_SKIPS = 25;

// Kuyruğu ilerletir: çalanı 'played' yapar, sıradakini seçip now_playing'e yazar.
// Oynatma artık admin cihazındaki gömülü player'da — burada yalnızca durum güncellenir,
// player now_playing'i Realtime ile dinleyip yeni videoyu yükler.
export async function playNextFromQueue(
  venueId: string,
  retryAfterFill = true,
  skips = 0
): Promise<NextResult> {
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
    // Sıra: öncelikliler her zaman üstte (sonradan eklenmiş olsa bile), her iki
    // sınıf da kendi içinde ekleme sırasıyla. added_at + id beraberlik kırıcıdır
    // (0034): request_song tüm öncelikli satırları position = 0 ile yazdığı için
    // bunlar olmadan sıra rastgeleydi — sonradan eklenen öncelikli, önce
    // eklenenin önüne geçebiliyordu.
    .order("priority", { ascending: false })
    .order("position", { ascending: true })
    .order("added_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextItem) {
    // Sıra boş yakalandıysa dolumu bekleyip bir kez daha dene — mekan listesinde
    // şarkı olduğu sürece "kuyruk boş" dönmemeli, çalma hiç durmamalı
    if (retryAfterFill) {
      await fillQueueToTen(venueId).catch(() => {});
      return playNextFromQueue(venueId, false, skips);
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

  // Çalınamaz satır: video kimliği yok (bozuk/eksik kayıt) ya da daha önce
  // çalınamadığı işaretlenmiş. İkisinde de satır kuyruktan düşer ve sıradakine
  // geçilir — eskiden video kimliği eksik satır kuyruğun başında kalıp çalmayı
  // kalıcı olarak kilitliyordu (player "kuyruk boş" sanıp susuyordu).
  const unplayable = !song?.youtube_video_id ? "video_id yok" : song.embeddable === false ? "embed kapalı" : null;

  if (unplayable) {
    await supabaseAdmin.from("queue").update({ status: "removed" }).eq("id", nextItem.id);

    // Bozuk kayıt bir daha seçilmesin: aksi halde otomatik dolum aynı şarkıyı
    // tekrar tekrar kuyruğa koyup atlatır (embed kapalı olan zaten işaretli)
    if (!song?.youtube_video_id && nextItem.song_id) {
      await supabaseAdmin.from("songs").update({ embeddable: false }).eq("id", nextItem.song_id);
    }

    if (skips >= MAX_SKIPS) {
      return { started: false, error: `çalınabilir şarkı bulunamadı (${unplayable})` };
    }
    return playNextFromQueue(venueId, retryAfterFill, skips + 1);
  }
  if (!song) return { started: false, error: "şarkı bulunamadı" }; // yukarıda elendi

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
    // started_at: 30 dk'lık tekrar-çalma kilidinin çapası (0025) — sayaç şarkı
    // bitince değil, çalmaya başladığı anda başlar
    supabaseAdmin
      .from("queue")
      .update({ status: "playing", started_at: new Date().toISOString() })
      .eq("id", nextItem.id),
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

// Panelin "geri" düğmesi: en son çalınmış şarkıya döner. Çalmakta olan satır
// kuyruğa geri konur (kendi priority/position değerleriyle, yani bıraktığı yere),
// böylece önceki şarkı bitince kaldığı yerden devam edilir.
export async function playPreviousFromQueue(venueId: string): Promise<NextResult> {
  const { data: prevItem } = await supabaseAdmin
    .from("queue")
    .select("id, song_id, songs(youtube_video_id, embeddable)")
    .eq("venue_id", venueId)
    .eq("status", "played")
    .order("played_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  type SongInfo = { youtube_video_id: string; embeddable: boolean };
  const songRel = prevItem?.songs as unknown as SongInfo | SongInfo[] | null;
  const song = Array.isArray(songRel) ? songRel[0] : songRel;

  // Geçmiş yoksa (ya da kayıt çalınamaz durumdaysa) "geri" en azından çalan
  // şarkıyı başa sarsın — düğme sessizce hiçbir şey yapmasın istemiyoruz.
  if (!prevItem || !song?.youtube_video_id || song.embeddable === false) {
    await supabaseAdmin
      .from("now_playing")
      .update({ progress_ms: 0, started_at: new Date().toISOString(), is_playing: true })
      .eq("venue_id", venueId);
    return { started: false, queueEmpty: false };
  }

  await supabaseAdmin
    .from("queue")
    .update({ status: "queued" })
    .eq("venue_id", venueId)
    .eq("status", "playing");

  await Promise.all([
    supabaseAdmin
      .from("now_playing")
      .update({
        song_id: prevItem.song_id,
        video_id: song.youtube_video_id,
        is_playing: true,
        progress_ms: 0,
        started_at: new Date().toISOString(),
      })
      .eq("venue_id", venueId),
    supabaseAdmin
      .from("queue")
      .update({ status: "playing", started_at: new Date().toISOString(), played_at: null })
      .eq("id", prevItem.id),
  ]);

  return { started: true, video_id: song.youtube_video_id, song_id: prevItem.song_id };
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
