// Test veritabanına doğrudan erişim: tohumlama ve sonuç doğrulama. Yalnızca
// pmj-staging'e bağlanır (bkz. e2e/env.ts). Postgres yerine Supabase'in HTTPS
// API'si kullanılıyor: pooler bağlantısı ağa göre takılabiliyor, CI'a da
// veritabanı şifresi vermek gerekmiyor.
import { createClient } from "@supabase/supabase-js";
import { E2E } from "./env";

export const VENUE_SLUG = "e2e-test";
export const VENUE_NAME = "E2E Test Mekanı";

// Gerçek YouTube kimlikleri: kapak görselleri i.ytimg.com'dan yüklenebilsin
export const SONGS = [
  { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley" },
  { videoId: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen" },
  { videoId: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi" },
];

const db = createClient(E2E.serverEnv.NEXT_PUBLIC_SUPABASE_URL, E2E.serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? "boş yanıt"}`);
  return res.data;
}

// Silme/güncelleme gibi veri döndürmeyen çağrılar
function ok(res: { error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

/** Test mekanını sıfırdan kurar: önceki koşudan kalan kuyruk/sipariş temizlenir. */
export async function seedVenue(): Promise<{ venueId: string }> {
  const venue = must(
    await db.from("venues").upsert({ slug: VENUE_SLUG, name: VENUE_NAME }, { onConflict: "slug" }).select("id").single(),
    "mekan",
  );
  const venueId = venue.id as string;

  for (const table of ["queue", "now_playing", "payment_orders", "song_requests", "one_time_songs"]) {
    ok(await db.from(table).delete().eq("venue_id", venueId), `${table} temizliği`);
  }

  const songs = must(
    await db
      .from("songs")
      .upsert(
        SONGS.map((s) => ({ youtube_video_id: s.videoId, title: s.title, artist: s.artist, duration_ms: 210_000 })),
        { onConflict: "youtube_video_id" },
      )
      .select("id"),
    "şarkılar",
  );
  const existing = must(await db.from("venue_songs").select("song_id").eq("venue_id", venueId), "mekan listesi");
  const have = new Set(existing.map((r) => r.song_id));
  const missing = songs.filter((s) => !have.has(s.id)).map((s) => ({ venue_id: venueId, song_id: s.id }));
  if (missing.length) ok(await db.from("venue_songs").insert(missing), "mekan listesine ekleme");

  await beatPlayer(venueId);
  return { venueId };
}

/**
 * Oynatıcı açıkmış gibi heartbeat yazar. 45 sn'den bayat heartbeat'te ekleme
 * kilitlenir (lib/player-status.ts) — testler ekleme anından önce tazeler.
 */
export async function beatPlayer(venueId: string) {
  ok(
    await db
      .from("now_playing")
      .upsert({ venue_id: venueId, last_heartbeat_at: new Date().toISOString() }, { onConflict: "venue_id" }),
    "heartbeat",
  );
}

/** Oynatıcıyı kapalı gösterir: heartbeat eşiğin (45 sn) çok ötesine çekilir. */
export async function stopPlayer(venueId: string) {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  ok(await db.from("now_playing").update({ last_heartbeat_at: stale }).eq("venue_id", venueId), "heartbeat");
}

/** Test başladıktan sonra bu mekanda açılan en son sipariş. */
export async function latestOrder(venueId: string, since: Date) {
  const rows = must(
    await db
      .from("payment_orders")
      .select("id, user_id, status, tokens, total")
      .eq("venue_id", venueId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
    "sipariş",
  );
  return (rows[0] as { id: string; user_id: string; status: string; tokens: number; total: number | string }) ?? null;
}

export async function walletOf(userId: string) {
  // Hiç işlem görmemiş kullanıcının cüzdan satırı olmayabilir
  const { data: wallet, error } = await db
    .from("user_wallets")
    .select("balance, paid_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`cüzdan: ${error.message}`);
  const tx = must(
    await db
      .from("wallet_transactions")
      .select("kind, amount, paid_amount")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    "cüzdan hareketleri",
  );
  return { balance: wallet?.balance ?? 0, paidBalance: wallet?.paid_balance ?? 0, transactions: tx };
}

/** Mekanın kuyruğunda müşterilerin eklediği satırlar (otomatik doldurma hariç). */
export async function customerQueue(venueId: string) {
  const rows = must(
    await db
      .from("queue")
      .select("user_id, priority, status, songs(youtube_video_id)")
      .eq("venue_id", venueId)
      .not("user_id", "is", null),
    "kuyruk",
  );
  return rows.map((r) => ({
    video_id: (r.songs as unknown as { youtube_video_id: string }).youtube_video_id,
    user_id: r.user_id as string,
    priority: r.priority as boolean,
    status: r.status as string,
  }));
}

/** Mekanda şu an çalan şarkının YouTube kimliği (yoksa null). */
export async function nowPlayingVideo(venueId: string): Promise<string | null> {
  const { data: row, error } = await db
    .from("now_playing")
    .select("songs(youtube_video_id)")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw new Error(`çalan şarkı: ${error.message}`);
  return (row?.songs as unknown as { youtube_video_id: string } | null)?.youtube_video_id ?? null;
}

/**
 * Başka bir müşteri şarkı eklemiş gibi kuyruğa doğrudan satır yazar — ekranın
 * değişikliği kendiliğinden (yeniden yüklemeden) görmesini sınamak için.
 */
export async function queueSongDirectly(venueId: string, videoId: string, addedBy = "Canlı Test") {
  const song = must(await db.from("songs").select("id").eq("youtube_video_id", videoId).single(), "şarkı");
  ok(
    await db.from("queue").insert({
      venue_id: venueId,
      song_id: song.id,
      status: "queued",
      priority: false,
      position: 1,
      added_by: addedBy,
      tokens_spent: 0,
    }),
    "kuyruğa ekleme",
  );
}

// ---------------------------------------------------------------------------
// Talep → onay akışı, alarm ve mutabakat testleri için yardımcılar

/** Ortak havuzda olan ama mekanın listesinde OLMAYAN şarkı — talep akışının konusu */
export const POOL_SONG = { videoId: "9bZkp7q19f0", title: "Gangnam Style", artist: "PSY" };

export async function seedPoolSong(venueId: string) {
  const song = must(
    await db
      .from("songs")
      .upsert(
        { youtube_video_id: POOL_SONG.videoId, title: POOL_SONG.title, artist: POOL_SONG.artist, duration_ms: 250_000, embeddable: true },
        { onConflict: "youtube_video_id" },
      )
      .select("id")
      .single(),
    "havuz şarkısı",
  );
  ok(await db.from("venue_songs").delete().eq("venue_id", venueId).eq("song_id", song.id), "listeden çıkarma");
  return song.id as string;
}

/** Test mekanının admini (yoksa açılır). Google bağlama kapısı kapalı. */
export async function ensureAdmin(venueId: string): Promise<{ adminId: string; sessionVersion: number }> {
  const username = "e2e-admin";
  const existing = must(
    await db.from("venue_admins").select("id, session_version").eq("venue_id", venueId).eq("username", username),
    "admin",
  );
  if (existing[0]) {
    ok(await db.from("venue_admins").update({ google_link_required: false }).eq("id", existing[0].id), "admin güncelleme");
    return { adminId: existing[0].id as string, sessionVersion: Number(existing[0].session_version ?? 1) };
  }
  const row = must(
    await db
      .from("venue_admins")
      // Şifreyle giriş testte kullanılmıyor; oturum çerezi doğrudan imzalanır
      .insert({ venue_id: venueId, username, password_hash: "e2e-not-a-real-hash", google_link_required: false })
      .select("id, session_version")
      .single(),
    "admin açma",
  );
  return { adminId: row.id as string, sessionVersion: Number(row.session_version ?? 1) };
}

export async function latestRequest(venueId: string) {
  const rows = must(
    await db
      .from("song_requests")
      .select("id, user_id, status, suggested_title, suggested_artist, song_id")
      .eq("venue_id", venueId)
      .order("requested_at", { ascending: false })
      .limit(1),
    "talep",
  );
  return (rows[0] as { id: string; user_id: string; status: string; suggested_title: string; suggested_artist: string; song_id: string | null }) ?? null;
}

export async function oneTimeGrant(venueId: string, songId: string) {
  const rows = must(
    await db.from("one_time_songs").select("id, consumed_at, consumed_by").eq("venue_id", venueId).eq("song_id", songId),
    "tek seferlik hak",
  );
  return (rows[0] as { id: string; consumed_at: string | null; consumed_by: string | null }) ?? null;
}

/** Müşteriye bedava jeton (ücretsiz 'grant' — hakedişe girmez) */
export async function grantTokens(userId: string, amount: number, venueId: string) {
  ok(await db.rpc("add_tokens", { p_user_id: userId, p_amount: amount, p_venue_id: venueId, p_kind: "grant" }), "jeton");
}

/** Bu mekan için `since`'ten beri tetiklenen bildirim türleri */
export async function pushKinds(venueId: string, since: Date): Promise<string[]> {
  const rows = must(
    await db.from("push_deliveries").select("kind").eq("venue_id", venueId).gte("created_at", since.toISOString()),
    "bildirim kayıtları",
  );
  return rows.map((r) => r.kind as string);
}

export async function issueKinds(venueId: string, since: Date): Promise<string[]> {
  const rows = must(
    await db.from("system_events").select("kind").eq("venue_id", venueId).gte("at", since.toISOString()),
    "sorun kayıtları",
  );
  return rows.map((r) => r.kind as string);
}

/** Test sonunda alarm denemesinin sağlık/sorun ekranı kayıtlarını siler */
export async function cleanupSilence(venueId: string, silenceId: string) {
  ok(await db.from("venue_events").delete().eq("venue_id", venueId).eq("detail->>silence_id", silenceId), "olay temizliği");
  ok(await db.from("system_events").delete().eq("venue_id", venueId).eq("detail->>silence_id", silenceId), "sorun temizliği");
}

/** Mutabakat testi için sabit bir müşteri hesabı (yoksa açılır) */
async function reconcileUser(): Promise<string> {
  const email = "e2e-reconcile@playmyjam.test";
  const { data: list, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`kullanıcı listesi: ${error.message}`);
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error: createError } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (createError || !data.user) throw new Error(`kullanıcı açma: ${createError?.message}`);
  return data.user.id;
}

/**
 * iyzico'ya hiç gitmemiş, `minutesAgo` dakika önce açılmış bekleyen sipariş —
 * ödeme formu açılıp kapatılmış müşteri. Dönüş (callback) hiç gelmeyecek.
 */
export async function createAbandonedOrder(venueId: string, minutesAgo: number) {
  const userId = await reconcileUser();
  const row = must(
    await db
      .from("payment_orders")
      .insert({
        user_id: userId,
        venue_id: venueId,
        tokens: 1,
        total: 20,
        status: "pending",
        buyer: { name: "E2E", surname: "Mutabakat" },
        created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      })
      .select("id")
      .single(),
    "sipariş",
  );
  return row.id as string;
}

export async function orderState(orderId: string) {
  const row = must(await db.from("payment_orders").select("status, raw_response").eq("id", orderId).single(), "sipariş");
  return row as { status: string; raw_response: Record<string, unknown> | null };
}
