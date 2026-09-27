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

  for (const table of ["queue", "now_playing", "payment_orders"]) {
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
