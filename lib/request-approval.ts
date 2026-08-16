import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser, sendPushToVenueAdmins } from "@/lib/push";
import { signRequestActionToken } from "@/lib/session";
import { suggestionMatchesSong } from "@/lib/suggestions";
import { searchVideos, YouTubeQuotaError, type TrackDetails } from "@/lib/youtube";

// Talep onay akışının tek karar noktası (bkz. 0045 migration). Hem panel
// düğmeleri hem bildirim üstündeki onay/ret buradan geçer — kural tek yerde.

/** Mekanın karar süresi ve müşterinin çaldırma süresi: ikisi de 10 dakika */
export const REQUEST_DECISION_MS = 10 * 60 * 1000;
export const PLAY_WINDOW_MS = 10 * 60 * 1000;

export type ApproveOutcome =
  | { ok: true; title: string; artist: string; songId: string; playDeadline: string }
  | { ok: false; error: string; status: number };

type SuggestionRow = {
  id: string;
  venue_id: string;
  user_id: string | null;
  status: string;
  expires_at: string | null;
  suggested_title: string | null;
  suggested_artist: string | null;
  song_id: string | null;
};

async function slugFor(venueId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("venues")
    .select("slug")
    .eq("id", venueId)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

/**
 * Öneriyi çalınabilir bir videoya çevirir. Kota savunması /api/search ile aynı
 * üç katman: (1) yerel songs tablosu (0 birim), (2) search_cache (0 birim),
 * (3) YouTube search.list (100 birim). Sonuç listesinin İLK ögesi seçilir —
 * mekan admini uğraşmasın diye karar otomatik.
 */
export async function resolveSuggestion(
  title: string,
  artist: string
): Promise<TrackDetails | { error: string; status: number }> {
  const query = `${artist} ${title}`.trim();
  const cacheKey = query.toLocaleLowerCase("tr");

  // 1) Yerel katalog: daha önce herhangi bir mekanda kullanılmış şarkılar.
  //    Kelime kümesi eşleşmesi öneri akışının kendi ölçütüyle aynı.
  const like = `%${title.toLocaleLowerCase("tr").replace(/[%_,()\\]/g, "")}%`;
  const { data: localRows } = await supabaseAdmin
    .from("songs")
    .select("youtube_video_id, title, artist, album_cover_url, duration_ms")
    .eq("embeddable", true)
    .ilike("title", like)
    .order("view_count", { ascending: false })
    .limit(10);

  const localHit = (localRows ?? []).find((s) =>
    suggestionMatchesSong({ suggested_title: title, suggested_artist: artist }, {
      id: "",
      title: s.title as string,
      artist: s.artist as string,
    })
  );
  if (localHit) return localHit as unknown as TrackDetails;

  // 2) Arama önbelleği (aynı sorgu 30 gün YouTube'a gitmez)
  const { data: cached } = await supabaseAdmin
    .from("search_cache")
    .select("results")
    .eq("query", cacheKey)
    .maybeSingle();
  const cachedFirst = (cached?.results as TrackDetails[] | undefined)?.[0];
  if (cachedFirst?.youtube_video_id) return cachedFirst;

  // 3) YouTube araması — kotanın tek büyük tüketicisi
  try {
    const results = await searchVideos(query);
    if (results.length === 0) {
      return { error: "Bu şarkı YouTube'da bulunamadı", status: 404 };
    }
    await supabaseAdmin
      .from("search_cache")
      .upsert({ query: cacheKey, results, cached_at: new Date().toISOString() });
    return results[0];
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      return { error: "YouTube arama kotası doldu, biraz sonra tekrar dene", status: 429 };
    }
    return { error: "Şarkı aranamadı, tekrar dene", status: 502 };
  }
}

/**
 * Talebi onaylar: şarkıyı çözer, TEK SEFERLİK çalma hakkı açar ve müşteriye
 * push atar. Mekanın kalıcı kataloğuna (venue_songs/playlist_songs) dokunmaz.
 */
export async function approveSuggestion(request: SuggestionRow): Promise<ApproveOutcome> {
  const title = request.suggested_title ?? "";
  const artist = request.suggested_artist ?? "";

  const resolved = await resolveSuggestion(title, artist);
  if ("error" in resolved) {
    return { ok: false, error: resolved.error, status: resolved.status };
  }

  const { data: songRow, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(
      {
        youtube_video_id: resolved.youtube_video_id,
        title: resolved.title,
        artist: resolved.artist,
        album_cover_url: resolved.album_cover_url,
        duration_ms: resolved.duration_ms,
      },
      { onConflict: "youtube_video_id" }
    )
    .select("id, embeddable")
    .single();

  if (songErr || !songRow) {
    return { ok: false, error: "Şarkı kaydedilemedi", status: 500 };
  }
  // Kara liste: bir kez "dış oynatıcıya kapalı" işaretlenen video geri giremez
  if (songRow.embeddable === false) {
    return { ok: false, error: "Bu şarkı YouTube'da dış oynatıcıya kapalı", status: 422 };
  }

  const now = Date.now();
  const playDeadline = new Date(now + PLAY_WINDOW_MS).toISOString();

  // Açık hak zaten varsa (aynı şarkı için ikinci onay) süresi uzatılır.
  // Tekillik indeksi kısmi olduğu için (consumed_at is null) upsert kullanılmaz.
  const { data: openGrant } = await supabaseAdmin
    .from("one_time_songs")
    .select("id")
    .eq("venue_id", request.venue_id)
    .eq("song_id", songRow.id)
    .is("consumed_at", null)
    .maybeSingle();

  const grantErr = openGrant
    ? (
        await supabaseAdmin
          .from("one_time_songs")
          .update({ expires_at: playDeadline, request_id: request.id })
          .eq("id", openGrant.id)
      ).error
    : (
        await supabaseAdmin.from("one_time_songs").insert({
          venue_id: request.venue_id,
          song_id: songRow.id,
          request_id: request.id,
          expires_at: playDeadline,
        })
      ).error;

  if (grantErr) {
    return { ok: false, error: "Çalma hakkı açılamadı", status: 500 };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("song_requests")
    .update({
      status: "accepted",
      song_id: songRow.id,
      approved_at: new Date(now).toISOString(),
      play_deadline: playDeadline,
      resolved_at: new Date(now).toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "pending"); // yarış: bu arada başka admin karar verdiyse dokunma

  if (updateErr) {
    return { ok: false, error: "Talep güncellenemedi", status: 500 };
  }

  // Müşteriye haber: 10 dakikalık pencere şimdi başladı
  if (request.user_id) {
    const slug = await slugFor(request.venue_id);
    await sendPushToUser(request.user_id, {
      title: "Şarkın onaylandı! 🎉",
      body: `${resolved.title} — ${resolved.artist}. 10 dakika içinde jetonunla sıraya ekle, sonra hakkın düşer.`,
      url: slug ? `/venue/${slug}/browse?song=${resolved.youtube_video_id}` : "/",
      tag: `req-${request.id}`,
    }).catch(() => {});
  }

  return {
    ok: true,
    title: resolved.title,
    artist: resolved.artist,
    songId: songRow.id,
    playDeadline,
  };
}

/** Talebi reddeder ve müşteriye bilgi push'u atar. */
export async function rejectSuggestion(request: SuggestionRow): Promise<void> {
  await supabaseAdmin
    .from("song_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", request.id)
    .eq("status", "pending");

  if (request.user_id && request.suggested_title) {
    await sendPushToUser(request.user_id, {
      title: "Talebin bu sefer olmadı",
      body: `${request.suggested_title} — mekan şu an bu şarkıyı çalmak istemedi.`,
      tag: `req-${request.id}`,
    }).catch(() => {});
  }
}

/**
 * Yeni talep geldiğinde mekan adminlerine bildirim atar. Bildirimde TEK düğme
 * (Onayla) ve dokununca açılan panel için imzalı jeton taşınır.
 *
 * Neden tek düğme: iki düğmeli bildirimde Android'de basılan düğme ile sunucuya
 * ulaşan komutun ters eşleştiği ölçüldü (13 Ağu 2026 — "Onayla"ya basıldığında
 * talep reddediliyordu). Tek eylemli bildirimde aynı akış doğru çalışıyor.
 * Reddetmek bildirime dokunup açılan panelden yapılır; sık olan işlem onay,
 * ve o tek dokunuşla kalıyor.
 */
export async function notifyAdminsOfRequest(params: {
  requestId: string;
  venueId: string;
  venueSlug: string;
  title: string;
  artist: string;
  requestedBy: string;
  /** Dış katalogdan seçilen şarkının kapağı — bildirimde hangi şarkı olduğu
   *  bir bakışta anlaşılsın diye. Yoksa uygulama ikonuna düşer. */
  coverUrl?: string;
}): Promise<void> {
  const token = signRequestActionToken(
    params.requestId,
    params.venueId,
    Math.ceil(REQUEST_DECISION_MS / 1000)
  );
  const url = `/admin/${params.venueSlug}/requests?act=${params.requestId}&t=${encodeURIComponent(token)}`;

  await sendPushToVenueAdmins(params.venueId, {
    title: "Yeni şarkı talebi",
    body: `${params.title} — ${params.artist} (${params.requestedBy}). Onayla'ya bas ya da reddetmek için bildirime dokun. Karar için 10 dakikan var.`,
    url,
    icon: params.coverUrl,
    tag: `req-${params.requestId}`,
    requireInteraction: true,
    // iOS bu alanı yok sayar; orada bildirime dokunmak yukarıdaki url'i açar
    actions: [{ action: "approve", title: "Onayla" }],
    data: { requestId: params.requestId, token },
  }).catch(() => {});
}

/** Süresi dolmuş bekleyen talepleri kapatır (fırsat buldukça çağrılır). */
export async function expireStaleRequests(venueId?: string): Promise<void> {
  await supabaseAdmin
    .rpc("expire_song_requests", { p_venue_id: venueId ?? null })
    .then(() => undefined, () => undefined);
}

/** Karar verilebilir mi: talep hâlâ bekliyor ve 10 dakikalık penceresi açık mı? */
export function isDecidable(request: { status: string; expires_at: string | null }): boolean {
  if (request.status !== "pending") return false;
  if (!request.expires_at) return true; // 0045 öncesi satırlar süresiz
  return new Date(request.expires_at).getTime() > Date.now();
}
