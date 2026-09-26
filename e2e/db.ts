// Test veritabanına doğrudan erişim: tohumlama ve sonuç doğrulama. Yalnızca
// pmj-staging'e bağlanır (bkz. e2e/env.ts).
import pg from "pg";
import { E2E } from "./env";

export const VENUE_SLUG = "e2e-test";
export const VENUE_NAME = "E2E Test Mekanı";

// Gerçek YouTube kimlikleri: kapak görselleri i.ytimg.com'dan yüklenebilsin
export const SONGS = [
  { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley" },
  { videoId: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen" },
  { videoId: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi" },
];

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: E2E.dbUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Test mekanını sıfırdan kurar: önceki koşudan kalan kuyruk/sipariş temizlenir. */
export async function seedVenue(): Promise<{ venueId: string }> {
  return withDb(async (c) => {
    await c.query("begin");
    try {
      const { rows } = await c.query<{ id: string }>(
        `insert into public.venues (slug, name) values ($1, $2)
         on conflict (slug) do update set name = excluded.name
         returning id`,
        [VENUE_SLUG, VENUE_NAME],
      );
      const venueId = rows[0].id;
      await c.query("delete from public.queue where venue_id = $1", [venueId]);
      await c.query("delete from public.now_playing where venue_id = $1", [venueId]);
      await c.query("delete from public.payment_orders where venue_id = $1", [venueId]);

      for (const s of SONGS) {
        const { rows: song } = await c.query<{ id: string }>(
          `insert into public.songs (youtube_video_id, title, artist, duration_ms)
           values ($1, $2, $3, 210000)
           on conflict (youtube_video_id) do update set title = excluded.title
           returning id`,
          [s.videoId, s.title, s.artist],
        );
        await c.query(
          `insert into public.venue_songs (venue_id, song_id)
           select $1, $2 where not exists (
             select 1 from public.venue_songs where venue_id = $1 and song_id = $2)`,
          [venueId, song[0].id],
        );
      }
      await c.query("commit");
      await beatPlayer(venueId, c);
      return { venueId };
    } catch (err) {
      await c.query("rollback");
      throw err;
    }
  });
}

/**
 * Oynatıcı açıkmış gibi heartbeat yazar. 45 sn'den bayat heartbeat'te ekleme
 * kilitlenir (lib/player-status.ts) — testler ekleme anından önce tazeler.
 */
export async function beatPlayer(venueId: string, client?: pg.Client) {
  const run = (c: pg.Client) =>
    c.query(
      `insert into public.now_playing (venue_id, last_heartbeat_at, is_playing)
       values ($1, now(), false)
       on conflict (venue_id) do update set last_heartbeat_at = now()`,
      [venueId],
    );
  return client ? run(client) : withDb(run);
}

/** Oynatıcıyı kapalı gösterir: heartbeat eşiğin (45 sn) çok ötesine çekilir. */
export async function stopPlayer(venueId: string) {
  await withDb((c) =>
    c.query(
      "update public.now_playing set last_heartbeat_at = now() - interval '10 minutes' where venue_id = $1",
      [venueId],
    ),
  );
}

/** Test başladıktan sonra bu mekanda açılan en son sipariş. */
export async function latestOrder(venueId: string, since: Date) {
  return withDb(async (c) => {
    const { rows } = await c.query<{ id: string; user_id: string; status: string; tokens: number; total: string }>(
      `select id, user_id, status, tokens, total from public.payment_orders
        where venue_id = $1 and created_at >= $2 order by created_at desc limit 1`,
      [venueId, since],
    );
    return rows[0] ?? null;
  });
}

export async function walletOf(userId: string) {
  return withDb(async (c) => {
    const { rows: wallet } = await c.query<{ balance: number; paid_balance: number }>(
      "select balance, paid_balance from public.user_wallets where user_id = $1",
      [userId],
    );
    const { rows: tx } = await c.query<{ kind: string; amount: number; paid_amount: number }>(
      "select kind, amount, paid_amount from public.wallet_transactions where user_id = $1 order by created_at",
      [userId],
    );
    return { balance: wallet[0]?.balance ?? 0, paidBalance: wallet[0]?.paid_balance ?? 0, transactions: tx };
  });
}

/** Mekanın kuyruğunda müşterilerin eklediği satırlar (otomatik doldurma hariç). */
export async function customerQueue(venueId: string) {
  return withDb(async (c) => {
    const { rows } = await c.query<{ video_id: string; user_id: string; priority: boolean; status: string }>(
      `select s.youtube_video_id as video_id, q.user_id, q.priority, q.status
         from public.queue q join public.songs s on s.id = q.song_id
        where q.venue_id = $1 and q.user_id is not null`,
      [venueId],
    );
    return rows;
  });
}
