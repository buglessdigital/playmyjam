import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ADMIN_ADDED_BY,
  AUTO_ADDED_BY,
  AUTO_POSITION_BASE,
  clearAutoQueue,
  fillQueue,
  jumpPlaylistCursorTo,
} from "@/lib/queue-fill";
import { sendPushToUser } from "@/lib/push";
import { purgeUnplayableSong } from "@/lib/playlist";

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
      await fillQueue(venueId).catch(() => {});
      return playNextFromQueue(venueId, false, skips);
    }
    await supabaseAdmin
      .from("now_playing")
      .update({ song_id: null, video_id: null, is_playing: false, progress_ms: 0 })
      .eq("venue_id", venueId);
    return { started: false, queueEmpty: true };
  }

  // Replenish queue after consuming a song — fire-and-forget
  fillQueue(venueId).catch(() => {});

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
    // Çalınamayan şarkı listelerde kalmasın (embed kapalı olan da dahil)
    if (nextItem.song_id) await purgeUnplayableSong(nextItem.song_id);

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

  notifySongOwner(venueId, nextItem.user_id, song);

  return { started: true, video_id: song.youtube_video_id, song_id: nextItem.song_id };
}

// Şarkının sahibine push: uygulama kapalıyken de "şarkın çalıyor" ulaşsın —
// fire-and-forget. Venue sayfaları slug ile çözümlenir; bildirim URL'i için slug'ı çek.
function notifySongOwner(
  venueId: string,
  userId: string | null,
  song: { title: string; artist: string; album_cover_url?: string | null }
): void {
  if (!userId) return;
  (async () => {
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select("slug")
      .eq("id", venueId)
      .single();
    await sendPushToUser(userId, {
      title: "Şarkın çalıyor! 🎵",
      body: `${song.title} — ${song.artist} şu an sahnede`,
      icon: song.album_cover_url ?? undefined,
      url: venue?.slug ? `/venue/${venue.slug}/queue` : "/",
    });
  })().catch(() => {});
}

export type PlayNowResult = {
  ok: boolean;
  video_id?: string;
  song_id?: string;
  error?: string;
};

type PlayNowTarget = {
  // Kuyruktaki bir satır ("sıradaki 10" panelinden)
  queueId?: string;
  // Katalogdan / playlist'ten bir şarkı
  songId?: string;
  // Şarkı bir playlist satırından seçildiyse: imleç o listenin o noktasına taşınır
  // ve devamı (5, 6, 7...) sıraya girer.
  playlistId?: string | null;
};

// "Bu şarkıyı ŞİMDİ çal": sahnedeki şarkı yarıda kesilir ve seçilen şarkı başlar.
//
// TEK KIRMIZI ÇİZGİ: sahnedeki şarkıyı müşteri jetonuyla eklediyse kesilmez.
// Müşteri parasını verip sırayı almıştır; panelden gelen hiçbir "şimdi çal"
// onun şarkısını yarıda bırakamaz. (Panelde de düğme kapalı görünür; burası
// sunucu tarafındaki asıl kilit — istek elle atılsa da geçmez.)
//
// Kesilen otomatik şarkı 'played' yazılır: fiilen sahneye çıkmıştı, geçmişte ve
// istatistikte yerini korur.
//
// deferQueueWork: kuyruk temizliği, imleç taşıma ve dolum ATLANIR — yalnızca
// sahne değişir. Çağıran taraf bunları yanıttan sonra (after) kendisi yapmalıdır;
// aksi halde kuyruk eski listenin şarkılarıyla kalır. Düğmenin sahneyi ~20 DB
// turu beklemeden değiştirmesi için var.
export async function playSongNow(
  venueId: string,
  target: PlayNowTarget,
  options?: { deferQueueWork?: boolean }
): Promise<PlayNowResult> {
  const { data: playingRows } = await supabaseAdmin
    .from("queue")
    .select("id, song_id, user_id")
    .eq("venue_id", venueId)
    .eq("status", "playing");

  const playing = playingRows ?? [];
  if (playing.some((row) => row.user_id !== null)) {
    return { ok: false, error: "Müşterinin eklediği şarkı çalıyor — yarıda kesilemez" };
  }

  type SongInfo = {
    id: string;
    youtube_video_id: string | null;
    embeddable: boolean | null;
    title: string;
    artist: string;
    album_cover_url: string | null;
  };

  // Hedefi çöz: ya kuyruktaki satır ya da katalogdaki şarkı
  let rowId: string | null = null;
  let rowUserId: string | null = null;
  let song: SongInfo | null = null;

  if (target.queueId) {
    const { data: row } = await supabaseAdmin
      .from("queue")
      .select("id, song_id, user_id, status, songs(id, youtube_video_id, embeddable, title, artist, album_cover_url)")
      .eq("id", target.queueId)
      .eq("venue_id", venueId)
      .maybeSingle();

    if (!row) return { ok: false, error: "Şarkı kuyrukta bulunamadı" };
    if (row.status === "playing") return { ok: false, error: "Bu şarkı zaten çalıyor" };
    if (row.status !== "queued") return { ok: false, error: "Bu şarkı artık sırada değil" };

    const rel = row.songs as unknown as SongInfo | SongInfo[] | null;
    song = Array.isArray(rel) ? rel[0] ?? null : rel;
    rowId = row.id;
    rowUserId = row.user_id;
  } else if (target.songId) {
    const { data } = await supabaseAdmin
      .from("songs")
      .select("id, youtube_video_id, embeddable, title, artist, album_cover_url")
      .eq("id", target.songId)
      .maybeSingle();
    song = (data as SongInfo | null) ?? null;
  }

  if (!song) return { ok: false, error: "Şarkı bulunamadı" };
  if (playing.some((row) => row.song_id === song!.id)) {
    return { ok: false, error: "Bu şarkı zaten çalıyor" };
  }
  if (!song.youtube_video_id) return { ok: false, error: "Bu şarkının video kimliği yok" };
  if (song.embeddable === false) {
    return { ok: false, error: "Bu şarkı YouTube'da dış oynatıcıya kapalı, çalınamıyor" };
  }

  // Playlist'in ortasından seçildiyse: bekleyen otomatik satırlar düşer, imleç bu
  // noktaya taşınır, dolum aşağıda listenin DEVAMINDAN yapılır. Müşteri istekleri
  // ve adminin elle eklediği satırlar bu temizlikten etkilenmez.
  if (target.playlistId && !options?.deferQueueWork) {
    await clearAutoQueue(venueId);
    await jumpPlaylistCursorTo(venueId, target.playlistId, song.id);
  }

  // Katalog/playlist yolunda şarkı kuyrukta zaten bekliyor olabilir — ikinci kez
  // çalmasın diye o satır sahneye alınır (yenisi açılmaz).
  if (!rowId) {
    const { data: existing } = await supabaseAdmin
      .from("queue")
      .select("id, user_id")
      .eq("venue_id", venueId)
      .eq("song_id", song.id)
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("position", { ascending: true })
      .order("added_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing) {
      rowId = existing.id;
      rowUserId = existing.user_id;
    }
  }

  const now = new Date().toISOString();

  // Kesilen şarkı kapanır. started_at'e dokunulmaz: 30 dk kilidinin çapası
  // şarkının fiilen başladığı andır (0025).
  if (playing.length > 0) {
    await supabaseAdmin
      .from("queue")
      .update({ status: "played", played_at: now })
      .in("id", playing.map((row) => row.id));
  }

  if (rowId) {
    await supabaseAdmin
      .from("queue")
      .update({ status: "playing", started_at: now, played_at: null })
      .eq("id", rowId);
  } else {
    // Kuyrukta yoktu: doğrudan sahneye çıkan yeni satır. Otomatik sınıfta
    // (user_id null) — jeton harcanmaz, 30 dk kilidi doğurmaz.
    await supabaseAdmin.from("queue").insert({
      venue_id: venueId,
      song_id: song.id,
      user_id: null,
      added_by: target.playlistId ? AUTO_ADDED_BY : ADMIN_ADDED_BY,
      tokens_spent: 0,
      priority: false,
      position: AUTO_POSITION_BASE,
      status: "playing",
      started_at: now,
      source_playlist_id: target.playlistId ?? null,
    });
  }

  await supabaseAdmin
    .from("now_playing")
    .update({
      song_id: song.id,
      video_id: song.youtube_video_id,
      is_playing: true,
      progress_ms: 0,
      started_at: now,
    })
    .eq("venue_id", venueId);

  // Boşalan yer (ve playlist atlamasında tamamen boşaltılan otomatik blok)
  // doldurulur: imleç yeni yerinde olduğu için liste kaldığı noktadan devam eder.
  if (!options?.deferQueueWork) await fillQueue(venueId).catch(() => {});

  notifySongOwner(venueId, rowUserId, song);

  return { ok: true, video_id: song.youtube_video_id, song_id: song.id };
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
  fillQueue(venueId).catch(() => {});
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
  await markUnplayable(videoId);
  return playNextFromQueue(venueId);
}

// Aynı işaretleme, ATLAMADAN. Hatayı bildiren boştaki (önyükleme) deck ise
// çalan şarkıya dokunulmamalıdır. Bu yol olmadığı için önyükleme sonsuz
// döngüye giriyordu: peek gömmeye kapalı videoyu döndürüyor → deck 150 hatası
// veriyor → istemci tamponu düşürüp susuyor → 10 sn sonra peek AYNI videoyu
// döndürüyor. Şarkı bir kez işaretlendiğinde peek onu artık atlar.
export async function markUnplayable(videoId: string): Promise<{ ok: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .update({ embeddable: false })
    .eq("youtube_video_id", videoId)
    .select("id")
    .maybeSingle();

  // İşaretlemek yetmez: şarkı playlist'lerde durdukça mekan onu listesinde
  // görmeye devam eder ve elle çalmayı deneyip aynı hatayı alır.
  if (data?.id) await purgeUnplayableSong(data.id);
  return { ok: !error };
}
