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

// Crossfade için sıradaki şarkıyı KUYRUĞU TÜKETMEDEN okur: player, çalan şarkının
// son saniyelerine gelmeden videoyu ikinci deck'e yükleyip tamponlayabilsin.
// Hiçbir yan etkisi yoktur (status değişmez, dolum tetiklenmez) — geçiş fiilen
// başladığında normal playNextFromQueue çağrılır ve gerçeği o yazar.
//
// Bu yüzden dönen kimlik "tahmindir": arada öncelikli bir istek gelirse geçiş
// anında başka bir video döner. Player bu durumu (önyüklenen ≠ dönen) tanıyıp
// videoyu geçiş anında yükler; ses akışı bozulmaz, yalnızca tamponlama avantajı
// kaybolur.
export async function peekNextFromQueue(venueId: string): Promise<{ video_id: string | null }> {
  const { data } = await supabaseAdmin
    .from("queue")
    .select("songs(youtube_video_id, embeddable)")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    // playNextFromQueue ile BİREBİR aynı sıralama (0034) — farklı olursa yanlış
    // şarkı önyüklenir
    .order("priority", { ascending: false })
    .order("position", { ascending: true })
    .order("added_at", { ascending: true })
    .order("id", { ascending: true })
    // Baştaki birkaç satır çalınamaz olabilir (embed kapalı); playNext bunları
    // atlayacağı için biz de atlayıp ilk çalınabilir olanı döneriz
    .limit(5);

  type SongInfo = { youtube_video_id: string | null; embeddable: boolean | null };
  for (const row of data ?? []) {
    const songRel = row.songs as unknown as SongInfo | SongInfo[] | null;
    const song = Array.isArray(songRel) ? songRel[0] : songRel;
    if (song?.youtube_video_id && song.embeddable !== false) {
      return { video_id: song.youtube_video_id };
    }
  }
  return { video_id: null };
}

// Player, ağ kesintisi sırasında sunucuya ulaşamayınca önden tamponladığı
// sıradaki şarkıya kendi kararıyla geçebiliyor (müzik susmasın diye). Bağlantı
// dönünce durumu GERÇEĞE hizalayan yol burasıdır: eski satır kapatılır, fiilen
// çalan şarkının satırı 'playing' olur ve now_playing ona çekilir.
//
// Neden playNextFromQueue değil: kesinti sırasında müşteri öncelikli bir şarkı
// eklemiş olabilir. "Bir ileri sar" deseydik sunucu o şarkıyı döndürür, player
// da çalmakta olan şarkıyı ORTASINDAN kesip ona atlardı. Burada kesme yok:
// çalan şarkı bitene kadar çalar, müşterinin öncelikli şarkısı sıradaki olur.
export async function syncPlayingVideo(
  venueId: string,
  videoId: string,
  progressMs = 0
): Promise<{ ok: boolean; matched: boolean }> {
  const { data: song } = await supabaseAdmin
    .from("songs")
    .select("id")
    .eq("youtube_video_id", videoId)
    .maybeSingle();
  if (!song) return { ok: false, matched: false };

  const progress = Math.max(progressMs, 0);
  const startedAt = new Date(Date.now() - progress).toISOString();

  const npPatch = {
    song_id: song.id,
    video_id: videoId,
    is_playing: true,
    progress_ms: progress,
    started_at: startedAt,
  };

  const { data: playingRows } = await supabaseAdmin
    .from("queue")
    .select("id, song_id")
    .eq("venue_id", venueId)
    .eq("status", "playing")
    .limit(2);
  const playing = playingRows ?? [];

  // Zaten bu şarkı sahnedeyse kuyruğa dokunma; yalnızca now_playing tazelenir
  if (playing.some((row) => row.song_id === song.id)) {
    await supabaseAdmin.from("now_playing").update(npPatch).eq("venue_id", venueId);
    return { ok: true, matched: true };
  }

  // Fiilen çalan şarkının kuyruktaki satırı (playNextFromQueue ile aynı sıralama)
  const { data: row } = await supabaseAdmin
    .from("queue")
    .select("id")
    .eq("venue_id", venueId)
    .eq("song_id", song.id)
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("position", { ascending: true })
    .order("added_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (playing.length > 0) {
    await supabaseAdmin
      .from("queue")
      .update({ status: "played", played_at: new Date().toISOString() })
      .in(
        "id",
        playing.map((r) => r.id)
      );
  }

  if (row) {
    // started_at 30 dk'lık tekrar kilidinin çapası: şarkı fiilen ne zaman
    // başladıysa o an yazılır (kesinti sırasında başlamıştı)
    await supabaseAdmin
      .from("queue")
      .update({ status: "playing", started_at: startedAt })
      .eq("id", row.id);
  }

  await supabaseAdmin.from("now_playing").update(npPatch).eq("venue_id", venueId);
  fillQueueToTen(venueId).catch(() => {});
  return { ok: true, matched: !!row };
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
