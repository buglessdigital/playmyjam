import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser, sendPushToVenueAdmins } from "@/lib/push";
import { reportIssue } from "@/lib/ops-log";
import { signRequestActionToken } from "@/lib/session";
import { pickBestMatch } from "@/lib/song-match";
import { getVideoDetails, searchVideos, YouTubeQuotaError, type TrackDetails } from "@/lib/youtube";
import {
  canSearchYouTube,
  markYouTubeQuotaExhausted,
  recordYouTubeSearch,
} from "@/lib/youtube-search-budget";
import { fetchOEmbed, parseVideoId } from "@/lib/youtube-oembed";

// Talep onay akışının tek karar noktası (bkz. 0045 migration). Hem panel
// düğmeleri hem bildirim üstündeki onay/ret buradan geçer — kural tek yerde.

/** Mekanın karar süresi ve müşterinin çaldırma süresi: ikisi de 10 dakika */
export const REQUEST_DECISION_MS = 10 * 60 * 1000;
export const PLAY_WINDOW_MS = 10 * 60 * 1000;

export type ApproveOutcome =
  | { ok: true; title: string; artist: string; songId: string; playDeadline: string }
  | { ok: false; error: string; status: number; code?: ResolveFailureCode };

/** needs_link: havuzda tanınmadı — admin YouTube bağlantısını yapıştırmalı */
export type ResolveFailureCode = "needs_link";

export type ResolveFailure = { error: string; status: number; code?: ResolveFailureCode };

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
 * Talebi ORTAK HAVUZDA arar. İki katman, ikisi de 0 kota birimi:
 *   1. songs tablosu — tohumlanan katalog + bugüne kadar kullanılmış her şarkı
 *      (bkz. scripts/seed-catalog.ts)
 *   2. search_cache — geçmişte YouTube'dan gelmiş sorgular
 *
 * Havuzda bulunamayan şarkı için YouTube araması (100 birim) ayrı adımdır:
 * searchYouTubeForRequest. Kota bittiyse admin bağlantı yapıştırır
 * (resolveVideoLink).
 *
 * Her katmanda aday listesinden EN İYİ SÜRÜM seçilir (lib/song-match.ts) —
 * ilk satırı almak karaoke/hızlandırılmış kayıt çaldırıyordu.
 */
export async function findInPool(title: string, artist: string): Promise<TrackDetails | null> {
  const request = { suggested_title: title, suggested_artist: artist };

  // 1) Ortak havuz.
  //    LIKE için başlığın parantezli eki atılır: talep "Kuzu Kuzu (Remastered)"
  //    diye gelse de YouTube başlığı sade olabiliyor, ham metinle arayınca kaçıyor.
  //
  //    DİKKAT — metin KÜÇÜLTÜLMEZ: JS "İ" harfini "i"ye indirirken Postgres onu
  //    "i̇" (i + birleşik nokta) yapıyor, ilike hiçbir zaman tutmuyordu.
  //    ("Rüyanda Görsen İnanma" havuzda dururken 0 aday dönüyordu.)
  const likeCore = title
    .replace(/[([].*$/, "")
    .replace(/[%_,()\\]/g, "")
    .trim();

  const COLUMNS =
    "youtube_video_id, title, artist, album_cover_url, duration_ms, channel_title, view_count";

  const artistCore = artist.split(/[,&]/)[0].replace(/[%_,()\\]/g, "").trim();

  // a) Başlık + sanatçı BİRLİKTE. Kısa başlıklar ("Gece", "Git", "Aşk", "Sor")
  //    binlerce şarkıda geçiyor; yalnız başlıkla aranınca en çok izlenen 50
  //    aday hep başka sanatçıların oluyor, doğru şarkı aday listesine hiç
  //    girmiyordu (16 Eki 2026: PMJ listesi içe aktarımında 107 "havuzda yok"un
  //    çoğu buydu). İkisi birlikte aranınca aday listesi küçük ve doğru.
  // b) Yalnız başlık — sanatçı farklı yazılmış olabilir (feat., kanal adı).
  // c) Yalnız sanatçı — başlık yazımı tutmadıysa (çeviri, imla, apostrof).
  // Eleme ve sürüm seçimi her adımda lib/song-match.ts'te; sorgular yalnızca aday topluyor.
  const attempts = [
    artistCore.length > 1 && likeCore
      ? () =>
          supabaseAdmin
            .from("songs")
            .select(COLUMNS)
            .eq("embeddable", true)
            .ilike("title", `%${likeCore}%`)
            .ilike("artist", `%${artistCore}%`)
            .order("view_count", { ascending: false })
            .limit(50)
      : null,
    likeCore
      ? () =>
          supabaseAdmin
            .from("songs")
            .select(COLUMNS)
            .eq("embeddable", true)
            .ilike("title", `%${likeCore}%`)
            .order("view_count", { ascending: false })
            .limit(50)
      : null,
    artistCore.length > 1
      ? () =>
          supabaseAdmin
            .from("songs")
            .select(COLUMNS)
            .eq("embeddable", true)
            .ilike("artist", `%${artistCore}%`)
            .order("view_count", { ascending: false })
            .limit(100)
      : null,
  ];

  for (const attempt of attempts) {
    if (!attempt) continue;
    const { data: localRows } = await attempt();
    const localHit = pickBestMatch(request, localRows ?? []);
    if (localHit) return localHit as unknown as TrackDetails;
  }

  // 2) Eski arama önbelleği
  const cacheKey = searchCacheKey(title, artist);
  const { data: cached } = await supabaseAdmin
    .from("search_cache")
    .select("results")
    .eq("query", cacheKey)
    .maybeSingle();

  const cachedResults = (cached?.results as TrackDetails[] | undefined) ?? [];
  const cachedHit = pickBestMatch(request, cachedResults) ?? cachedResults[0];
  return cachedHit?.youtube_video_id ? cachedHit : null;
}

function searchCacheKey(title: string, artist: string): string {
  return `${artist} ${title}`.trim().toLocaleLowerCase("tr");
}

type SearchOutcome = { hit: TrackDetails } | { miss: "no_budget" | "not_found" };

/**
 * Havuzda olmayan talebi YouTube'da arar (search.list = 100 birim, günlük
 * tavanlı — bkz. lib/youtube-search-budget.ts). Sonuç search_cache'e yazılır:
 * talep düşerken yapılan arama onay anında findInPool'dan bedavaya geri gelir.
 *
 * Eşleşme yoksa ilk sonuç ALINMAZ — admin bildirimde müşterinin yazdığını
 * görüp kör onaylıyor, alakasız video çalmasın. O durumda boş sonuç
 * önbelleğe yazılır (aynı talep için ikinci kez 100 birim yakılmaz) ve admin
 * bağlantıyı kendisi yapıştırır.
 */
async function searchYouTubeForRequest(title: string, artist: string): Promise<SearchOutcome> {
  const cacheKey = searchCacheKey(title, artist);
  const { data: cached } = await supabaseAdmin
    .from("search_cache")
    .select("query")
    .eq("query", cacheKey)
    .maybeSingle();
  // Daha önce arandı ve findInPool'da tutmadı → YouTube'da da yok
  if (cached) return { miss: "not_found" };

  if (!(await canSearchYouTube())) return { miss: "no_budget" };

  let results: TrackDetails[];
  try {
    await recordYouTubeSearch();
    results = await searchVideos(`${artist} ${title}`.trim());
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      await markYouTubeQuotaExhausted();
      return { miss: "no_budget" };
    }
    // Geçici hata: önbelleğe yazılmaz, bir sonraki deneme yeniden arar
    return { miss: "not_found" };
  }

  const hit = pickBestMatch({ suggested_title: title, suggested_artist: artist }, results);
  await supabaseAdmin
    .from("search_cache")
    .upsert(
      { query: cacheKey, results: hit ? results : [], cached_at: new Date().toISOString() },
      { onConflict: "query" }
    );
  return hit ? { hit } : { miss: "not_found" };
}

/** Havuz → YouTube araması. Bildirim ve onay aynı sırayı izler. */
async function findPlayable(title: string, artist: string): Promise<SearchOutcome> {
  const pooled = await findInPool(title, artist);
  if (pooled) return { hit: pooled };
  return searchYouTubeForRequest(title, artist);
}

const NEEDS_LINK: Record<"no_budget" | "not_found", ResolveFailure> = {
  no_budget: {
    error: "YouTube arama kotası bugünlük doldu — YouTube'dan bağlantıyı kopyalayıp yapıştır",
    status: 422,
    code: "needs_link",
  },
  not_found: {
    error: "Şarkı otomatik bulunamadı — YouTube'dan bağlantıyı kopyalayıp yapıştır",
    status: 422,
    code: "needs_link",
  },
};

export async function resolveSuggestion(
  title: string,
  artist: string
): Promise<TrackDetails | ResolveFailure> {
  const found = await findPlayable(title, artist);
  return "hit" in found ? found.hit : NEEDS_LINK[found.miss];
}

/**
 * Admin'in yapıştırdığı YouTube bağlantısını çalınabilir şarkıya çevirir.
 *
 * Burada videos.list kullanılır ve TALEP BAŞINA 1 BİRİM yakar — search.list'in
 * 100 biriminin yanında ihmal edilebilir (günlük kotayla 10.000 elle onay).
 * Karşılığında SÜRE kesin gelir; süre kuyruk hesabı ve çapraz geçiş için şart.
 *
 * Kota yine de dolmuşsa oEmbed'e düşülür: şarkı çalar, yalnızca süre bilinmez
 * (player çalarken öğrenir). Mekan kotadan dolayı iş göremez halde bırakılmaz.
 */
export async function resolveVideoLink(input: string): Promise<TrackDetails | ResolveFailure> {
  const videoId = parseVideoId(input);
  if (!videoId) {
    return { error: "Geçerli bir YouTube bağlantısı değil", status: 400 };
  }

  try {
    const [details] = await getVideoDetails([videoId]);
    if (details) return details;
    // getVideoDetails boş dönerse video ya silinmiş, ya gömmeye kapalı, ya da
    // süresi sınırların dışında (canlı yayın / saatlik karışım)
    return { error: "Bu video gömülü oynatıcıda çalmıyor — başka bir bağlantı dene", status: 422 };
  } catch (err) {
    if (!(err instanceof YouTubeQuotaError)) {
      return { error: "Video bilgisi alınamadı, tekrar dene", status: 502 };
    }
  }

  const fallback = await fetchOEmbed(videoId);
  if (!fallback) {
    return { error: "Bu video açılamadı — başka bir bağlantı dene", status: 422 };
  }
  return {
    ...fallback,
    duration_ms: 0, // player çalarken öğrenir; kuyruk süresi o ana kadar tahmini
    view_count: 0,
    release_date: null,
    external_url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

/**
 * Talebi onaylar: şarkıyı çözer, TEK SEFERLİK çalma hakkı açar ve müşteriye
 * push atar. Mekanın kalıcı kataloğuna (venue_songs/playlist_songs) dokunmaz.
 *
 * videoUrl verilirse havuz hiç yoklanmaz: admin hangi videoyu istediğini zaten
 * söylemiştir. Verilmezse havuza bakılır; bulunamazsa code:"needs_link" döner
 * ve panel yapıştırma alanını açar.
 */
export async function approveSuggestion(
  request: SuggestionRow,
  videoUrl?: string
): Promise<ApproveOutcome> {
  const title = request.suggested_title ?? "";
  const artist = request.suggested_artist ?? "";

  const resolved = videoUrl
    ? await resolveVideoLink(videoUrl)
    : await resolveSuggestion(title, artist);
  if ("error" in resolved) {
    return { ok: false, error: resolved.error, status: resolved.status, code: resolved.code };
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
    }, { kind: "request_approved", venueId: request.venue_id }).catch((err) =>
      reportIssue({
        area: "push",
        kind: "request_approved_failed",
        severity: "error",
        message: `"Şarkın onaylandı" bildirimi gönderilemedi: ${resolved.title} — ${resolved.artist}`,
        venueId: request.venue_id,
        detail: { request_id: request.id, user_id: request.user_id },
        error: err,
      })
    );
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
    // Bildirime dokunan müşteri doğrudan aramaya düşer, başka şarkı seçer
    const slug = await slugFor(request.venue_id);
    await sendPushToUser(request.user_id, {
      title: "Talebin bu sefer olmadı",
      body: `${request.suggested_title} — mekan şu an bu şarkıyı çalmak istemedi. Başka bir şarkı seçebilirsin.`,
      url: slug ? `/venue/${slug}/browse?search=1` : "/",
      tag: `req-${request.id}`,
    }, { kind: "request_rejected", venueId: request.venue_id }).catch((err) =>
      reportIssue({
        area: "push",
        kind: "request_rejected_failed",
        severity: "warn",
        message: `"Talebin olmadı" bildirimi gönderilemedi: ${request.suggested_title}`,
        venueId: request.venue_id,
        detail: { request_id: request.id, user_id: request.user_id },
        error: err,
      })
    );
  }
}

/**
 * Yeni talep geldiğinde mekan adminlerine bildirim atar.
 *
 * İKİ TÜR BİLDİRİM — ayrımı burada, talep düşer düşmez yapılır:
 *   A) Şarkı havuzda TANINIYOR ya da YouTube aramasında bulundu (100 birim,
 *      günlük tavanlı) → bildirimde "Onayla" düğmesi. Tek dokunuş, panel hiç
 *      açılmaz; onay anında sonuç search_cache'ten gelir, ikinci arama yok.
 *   B) Bulunamadı ya da arama kotası bitti → onaylanacak somut bir video yok.
 *      Düğme konmaz; admin bildirime dokunur, panelde bağlantıyı yapıştırır.
 *
 * Neden tek düğme: iki düğmeli bildirimde Android'de basılan düğme ile sunucuya
 * ulaşan komutun ters eşleştiği ölçüldü (13 Ağu 2026 — "Onayla"ya basıldığında
 * talep reddediliyordu). Tek eylemli bildirimde aynı akış doğru çalışıyor.
 * Reddetmek her iki türde de bildirime dokunup panelden yapılır.
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

  // Başarısız olursa B türü bildirim atılır (yani admin panele yönlendirilir),
  // akış durmaz
  const found = await findPlayable(params.title, params.artist).catch(() => null);
  const known = found && "hit" in found ? found.hit : null;

  await sendPushToVenueAdmins(params.venueId, {
    title: "Yeni şarkı talebi",
    body: known
      ? `${params.title} — ${params.artist} (${params.requestedBy}). Onayla'ya bas ya da reddetmek için bildirime dokun. Karar için 10 dakikan var.`
      : `${params.title} — ${params.artist} (${params.requestedBy}). Bu şarkı listende yok: onaylamak için bildirime dokun. Karar için 10 dakikan var.`,
    url,
    icon: params.coverUrl ?? known?.album_cover_url,
    tag: `req-${params.requestId}`,
    requireInteraction: true,
    // iOS bu alanı yok sayar; orada bildirime dokunmak yukarıdaki url'i açar
    ...(known ? { actions: [{ action: "approve", title: "Onayla" }] } : {}),
    data: { requestId: params.requestId, token },
  },
    { kind: "request_new" },
    // Karar penceresi kapandıktan sonra düşen bildirim işe yaramaz
    { ttl: Math.ceil(REQUEST_DECISION_MS / 1000) }
  ).catch((err) =>
    reportIssue({
      area: "push",
      kind: "request_new_failed",
      severity: "error",
      message: `Mekana "yeni şarkı talebi" bildirimi gönderilemedi: ${params.title} — ${params.artist}`,
      venueId: params.venueId,
      detail: { request_id: params.requestId },
      error: err,
    })
  );
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
