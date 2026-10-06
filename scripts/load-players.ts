#!/usr/bin/env node
/**
 * Çok mekan yük testi: aynı anda N player (her biri ayrı mekan) + aynı sekmedeki
 * admin paneli. YALNIZCA test projesine (staging) karşı çalışır.
 *
 *   npm run load:players                                  # 30 player, 300 sn, dağınık tempo
 *   npm run load:players -- --players 30 --storm          # hepsi aynı saniyede şarkı değiştirir
 *   npm run load:players -- --phones 5                    # mekan başına 5 müşteri ekranı da
 *
 * Player başına gerçek ekranın yaptıkları (bkz. components/player/YouTubePlayer.tsx):
 *   - 5 sn'de bir heartbeat: route'un yaptığı sorgular (claim okuma + now_playing yazma)
 *   - 1 sn'de bir player-bus broadcast (panelin alt barı)
 *   - 15 sn'de bir mutabakat okuması (now_playing)
 *   - player-queue + player-np postgres_changes aboneliği
 *   - şarkı bitince GERÇEK lib/queue.ts playNextFromQueue (sahne kilidi + dolum dahil),
 *     şarkı ortasında peekNextFromQueue (crossfade önyüklemesi)
 * Panel (aynı Realtime bağlantısı): admin-np + admin-queue aboneliği, her olayda okuma.
 *
 * Ölçülenler: heartbeat/geçiş süreleri, geçiş sonuçları (busy/kept/hata), şarkı
 * değişiminin player'a postgres_changes ile ulaşma süresi, broadcast teslim süresi,
 * kanal hataları, veritabanı bağlantı sayısı. Test mekanları `yuk-player-NN`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import pg from "pg";

const ROOT = join(import.meta.dirname, "..");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(ROOT, ".env.new"), "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 0 || line.trimStart().startsWith("#")) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = readEnv();
const URL_ = env.STAGING_SUPABASE_URL;
const ANON = env.STAGING_ANON_KEY;
const SERVICE = env.STAGING_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error(".env.new içinde STAGING_SUPABASE_URL / STAGING_ANON_KEY / STAGING_SERVICE_ROLE_KEY yok");
  process.exit(1);
}
// lib/ kodu bu değişkenlerle staging'e bağlanır — prod anahtarı asla okunmaz
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;

const PLAYERS = Number(arg("players", "30"));
const SECONDS = Number(arg("seconds", "300"));
const SONG_MS = Number(arg("song-sec", "45")) * 1000;
const PHONES = Number(arg("phones", "0"));
const ADD_MS = Number(arg("add-sec", "40")) * 1000;
const STORM = flag("storm");
const HEARTBEAT_MS = 5_000;
const STATE_BEAT_MS = 1_000;
const RECONCILE_MS = 15_000;
const SONGS_PER_VENUE = Math.ceil(SECONDS / (SONG_MS / 1000)) + 30;

const jiti = createJiti(join(ROOT, "/"), { alias: { "@": ROOT } });
const queueLib = (await jiti.import(join(ROOT, "lib/queue.ts"))) as typeof import("../lib/queue.ts");

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

// ── Test mekanları ──────────────────────────────────────────────────────────
type Song = { id: string; youtube_video_id: string };

async function seedSongs(): Promise<Song[]> {
  return must(
    await admin
      .from("songs")
      .upsert(
        Array.from({ length: SONGS_PER_VENUE }, (_, i) => ({
          youtube_video_id: `yukplayer${String(i).padStart(3, "0")}`,
          title: `Yük Player ${i + 1}`,
          artist: "PMJ",
          duration_ms: SONG_MS,
          embeddable: true,
        })),
        { onConflict: "youtube_video_id" },
      )
      .select("id, youtube_video_id")
      .order("youtube_video_id"),
    "şarkılar",
  ) as Song[];
}

async function seedVenue(n: number, songs: Song[]): Promise<string> {
  const slug = `yuk-player-${String(n).padStart(2, "0")}`;
  const venue = must(
    await admin.from("venues").upsert({ slug, name: `Yük Player ${n}` }, { onConflict: "slug" }).select("id").single(),
    "mekan",
  ) as { id: string };
  const venueId = venue.id;
  must(await admin.from("queue").delete().eq("venue_id", venueId).select("id"), "kuyruk temizliği");
  must(
    await admin.from("venue_songs").upsert(
      songs.map((s) => ({ venue_id: venueId, song_id: s.id })),
      { onConflict: "venue_id,song_id", ignoreDuplicates: true },
    ),
    "katalog",
  );
  // Dağınık tempoda her mekanın şarkısı farklı bir anda biter; fırtınada hepsi aynı anda
  const offset = STORM ? 0 : Math.floor(Math.random() * SONG_MS);
  const startedAt = new Date(Date.now() - offset).toISOString();
  const [first, ...rest] = songs;
  must(
    await admin.from("queue").insert([
      { venue_id: venueId, song_id: first.id, status: "playing", priority: false, position: 0, added_by: "yük testi", tokens_spent: 0, started_at: startedAt },
      ...rest.map((s, i) => ({ venue_id: venueId, song_id: s.id, status: "queued", priority: false, position: i + 1, added_by: "yük testi", tokens_spent: 0 })),
    ]).select("id"),
    "kuyruk",
  );
  must(
    await admin
      .from("now_playing")
      .upsert(
        { venue_id: venueId, song_id: first.id, video_id: first.youtube_video_id, is_playing: true, started_at: startedAt, progress_ms: offset, last_heartbeat_at: new Date().toISOString(), player_claim: null, player_claim_at: null, customer_adds_paused_at: null },
        { onConflict: "venue_id" },
      )
      .select("venue_id"),
    "çalan şarkı",
  );
  return venueId;
}

// ── Ölçüm ───────────────────────────────────────────────────────────────────
const m = {
  heartbeat: [] as number[],
  heartbeatErr: 0,
  advance: [] as number[],
  advanceOutcome: {} as Record<string, number>,
  // şarkının bitişinden yeni şarkının player'ın np aboneliğine ulaşmasına
  songGap: [] as number[],
  npDelivery: [] as number[],
  busDelivery: [] as number[],
  busSent: 0,
  busRecv: 0,
  reads: [] as number[],
  readErr: 0,
  peek: [] as number[],
  channelProblems: {} as Record<string, number>,
  dbConnections: [] as number[],
};

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}
const line = (v: number[]) => `n=${v.length} p50 ${pct(v, 50)} ms · p95 ${pct(v, 95)} ms · max ${pct(v, 100)} ms`;

function watch(name: string) {
  return (status: string) => {
    if (status === "SUBSCRIBED") return;
    if (status === "CLOSED" && stopping) return;
    m.channelProblems[`${name}:${status}`] = (m.channelProblems[`${name}:${status}`] ?? 0) + 1;
  };
}

async function timedRead(fn: () => PromiseLike<{ error: unknown }>) {
  const t0 = performance.now();
  const { error } = await fn();
  if (error) m.readErr += 1;
  else m.reads.push(performance.now() - t0);
}

let stopping = false;

// ── Bir mekan: player + panel aynı sekmede (tek Realtime bağlantısı) ─────────
function startVenue(venueId: string, until: number) {
  const tab: SupabaseClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const claimId = crypto.randomUUID();
  const state = { videoId: "", songStartedAt: 0, endedAt: 0, endedFrom: "", peeked: false, advancing: false };
  const timers: ReturnType<typeof setInterval>[] = [];

  // Player
  const bus = tab.channel(`player-bus:${venueId}`, { config: { broadcast: { self: false, ack: false } } });
  bus.subscribe(watch("player-bus"));
  tab
    .channel(`player-queue:${venueId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueId}` }, () => {})
    .subscribe(watch("player-queue"));
  tab
    .channel(`player-np:${venueId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueId}` }, (p: { new: { video_id: string | null } }) => {
      const v = p.new.video_id;
      if (v && state.endedAt && v !== state.endedFrom) {
        m.songGap.push(Date.now() - state.endedAt);
        state.endedAt = 0;
      }
      if (lastWrite.has(venueId)) {
        m.npDelivery.push(Date.now() - lastWrite.get(venueId)!);
        lastWrite.delete(venueId);
      }
    })
    .subscribe(watch("player-np"));

  // Panel (aynı sekme): her now_playing/queue olayında okuma
  const fetchNp = () => timedRead(() => tab.from("now_playing").select("video_id, song_id, is_playing, started_at, progress_ms, last_heartbeat_at, volume").eq("venue_id", venueId).maybeSingle());
  const reloadQueue = () => timedRead(() => tab.rpc("get_queue_state", { p_venue_id: venueId }));
  const sfx = Math.random().toString(36).slice(2);
  tab
    .channel(`admin-np:${venueId}:${sfx}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueId}` }, () => void fetchNp())
    .subscribe(watch("admin-np"));
  tab
    .channel(`admin-queue:${venueId}:${sfx}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueId}` }, () => void reloadQueue())
    .subscribe(watch("admin-queue"));

  // Heartbeat: route.ts "heartbeat" dalının sorguları (servis anahtarıyla, sunucudaki gibi)
  const heartbeat = async () => {
    const t0 = performance.now();
    try {
      const claim = await admin.from("now_playing").select("player_claim, player_claim_at").eq("venue_id", venueId).maybeSingle();
      if (claim.error) throw claim.error;
      const progress = Date.now() - state.songStartedAt;
      const now = new Date().toISOString();
      lastWrite.set(venueId, Date.now());
      const { data, error } = await admin
        .from("now_playing")
        .update({ progress_ms: Math.max(progress, 0), is_playing: true, last_heartbeat_at: now, player_claim: claimId, player_claim_at: now, started_at: new Date(Date.now() - progress).toISOString() })
        .eq("venue_id", venueId)
        .eq("video_id", state.videoId)
        .select("venue_id");
      if (error) throw error;
      if (!data?.length) {
        const r = await admin.from("now_playing").update({ last_heartbeat_at: now, player_claim: claimId, player_claim_at: now }).eq("venue_id", venueId);
        if (r.error) throw r.error;
      }
      m.heartbeat.push(performance.now() - t0);
    } catch {
      m.heartbeatErr += 1;
    }
  };

  const advance = async () => {
    if (state.advancing) return;
    state.advancing = true;
    state.endedAt = Date.now();
    state.endedFrom = state.videoId;
    const from = state.videoId;
    let last = "";
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const t0 = performance.now();
        // İlk deneme şarkının kendi bitişi; kapıya takılırsa player bitişi doğrulayıp zorlar
        const res = await queueLib.playNextFromQueue(venueId, {
          fromVideoId: from,
          force: last === "kept",
        });
        m.advance.push(performance.now() - t0);
        const o = outcomeOf(res);
        last = o;
        m.advanceOutcome[o] = (m.advanceOutcome[o] ?? 0) + 1;
        if (res.started && res.video_id) {
          if (res.video_id !== state.videoId) {
            state.videoId = res.video_id;
            state.songStartedAt = Date.now();
            state.peeked = false;
          }
          return;
        }
        if (o === "queueEmpty" || o === "error") return;
        await sleep(o === "busy" ? 700 : 1200);
      }
    } finally {
      state.advancing = false;
    }
  };

  const tick = () => {
    if (Date.now() > until || !state.videoId) return;
    const elapsed = Date.now() - state.songStartedAt;
    if (!state.peeked && elapsed > SONG_MS / 2) {
      state.peeked = true;
      const t0 = performance.now();
      void queueLib.peekNextFromQueue(venueId).then(() => m.peek.push(performance.now() - t0));
    }
    if (elapsed >= SONG_MS) void advance();
  };

  const beat = () => {
    try {
      m.busSent += 1;
      void bus.send({ type: "broadcast", event: "state", payload: { video_id: state.videoId, is_playing: true, progress_ms: Date.now() - state.songStartedAt, at: Date.now(), started: true } });
    } catch {}
  };

  const start = async (videoId: string, startedAt: number) => {
    state.videoId = videoId;
    state.songStartedAt = startedAt;
    // Açılıştaki claim (route "claim" dalı)
    await admin.from("now_playing").update({ player_claim: claimId, player_claim_at: new Date().toISOString() }).eq("venue_id", venueId);
    void fetchNp();
    void reloadQueue();
    // Gerçek player'da aralıklar açılış anına göre kayık başlar
    await sleep(Math.random() * HEARTBEAT_MS);
    timers.push(setInterval(() => void heartbeat(), HEARTBEAT_MS));
    timers.push(setInterval(beat, STATE_BEAT_MS));
    timers.push(setInterval(() => void timedRead(() => tab.from("now_playing").select("video_id, song_id, is_playing, started_at, volume, crossfade_ms").eq("venue_id", venueId).maybeSingle()), RECONCILE_MS));
    timers.push(setInterval(tick, 250));
    timers.push(setInterval(() => void fetchNp(), 15_000));
  };

  return {
    start,
    stop: () => {
      timers.forEach(clearInterval);
      void tab.removeAllChannels();
    },
  };
}

function outcomeOf(r: { started?: boolean; busy?: boolean; kept?: boolean; error?: string; queueEmpty?: boolean; already?: boolean } | undefined): string {
  if (!r) return "none";
  if (r.busy) return "busy";
  if (r.error) return "error";
  if (r.kept) return "kept";
  if (r.already) return "already";
  if (r.queueEmpty) return "queueEmpty";
  if (r.started) return "started";
  return "other";
}

// Son heartbeat yazımının anı: np aboneliğine ulaşma süresi buna göre ölçülür
const lastWrite = new Map<string, number>();

// TV modundaki uzak panel gibi: tüm mekanların player-bus'ını dinleyen ayrı bağlantı
function startBusListener(venueIds: string[]) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  for (const id of venueIds) {
    c.channel(`player-bus:${id}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "state" }, ({ payload }: { payload: { at: number } }) => {
        m.busRecv += 1;
        m.busDelivery.push(Date.now() - payload.at);
      })
      .subscribe(watch("bus-listener"));
  }
  return () => void c.removeAllChannels();
}

// Müşteri ekranları (venue-live hattı) + ara ara müşteri eklemesi
function startPhones(venueId: string) {
  const phones = Array.from({ length: PHONES }, () => {
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    let timer: ReturnType<typeof setTimeout> | null = null;
    c.channel(`venue-live:${venueId}`)
      .on("broadcast", { event: "*" }, (msg: { event: string }) => {
        if (msg.event === "beat" || timer) return;
        timer = setTimeout(() => {
          timer = null;
          void timedRead(() => c.rpc("get_queue_state", { p_venue_id: venueId }));
        }, 150 + Math.random() * 600);
      })
      .subscribe(watch("phone-live"));
    void timedRead(() => c.rpc("get_queue_state", { p_venue_id: venueId }));
    return c;
  });
  return () => phones.forEach((c) => void c.removeAllChannels());
}

async function customerAdds(venueIds: string[], songs: Song[], until: number) {
  if (!PHONES) return;
  const next = new Map(venueIds.map((id) => [id, Date.now() + Math.random() * ADD_MS]));
  while (Date.now() < until) {
    for (const id of venueIds) {
      if (Date.now() < next.get(id)!) continue;
      next.set(id, Date.now() + ADD_MS);
      const s = songs[Math.floor(Math.random() * songs.length)];
      void admin.from("queue").insert({ venue_id: id, song_id: s.id, status: "queued", priority: false, position: 5000 + Math.floor(Math.random() * 1e6), added_by: "yük testi", tokens_spent: 0 });
    }
    await sleep(500);
  }
}

// ── Veritabanı gözlemi ──────────────────────────────────────────────────────
async function sampleDb(until: number) {
  if (!env.STAGING_DB_URL) return;
  const db = new pg.Client({ connectionString: env.STAGING_DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await db.connect();
    while (Date.now() < until) {
      const { rows } = await db.query("select count(*)::int as n from pg_stat_activity where datname = current_database()");
      m.dbConnections.push(rows[0].n);
      await sleep(5_000);
    }
  } catch (e) {
    console.error("db gözlemi:", (e as Error).message);
  } finally {
    await db.end().catch(() => {});
  }
}

// ── Çalıştır ────────────────────────────────────────────────────────────────
const songs = await seedSongs();
const venueIds: string[] = [];
for (let i = 1; i <= PLAYERS; i++) venueIds.push(await seedVenue(i, songs));
console.log(
  `staging · ${PLAYERS} player · ${SECONDS} sn · şarkı ${SONG_MS / 1000} sn · ` +
    `${STORM ? "FIRTINA (hepsi aynı anda geçer)" : "dağınık tempo"}` +
    (PHONES ? ` · mekan başına ${PHONES} telefon, ${ADD_MS / 1000} sn'de bir ekleme` : ""),
);

const until = Date.now() + SECONDS * 1000;
const venues = venueIds.map((id) => startVenue(id, until));
const stopBus = startBusListener(venueIds);
const stopPhones = venueIds.map(startPhones);
await sleep(4_000); // abonelikler otursun

const nps = must(await admin.from("now_playing").select("venue_id, video_id, started_at").in("venue_id", venueIds), "başlangıç") as { venue_id: string; video_id: string; started_at: string }[];
await Promise.all(
  venueIds.map((id, i) => {
    const np = nps.find((r) => r.venue_id === id)!;
    return venues[i].start(np.video_id, Date.parse(np.started_at));
  }),
);
m.reads = [];
m.readErr = 0;

const progress = setInterval(() => {
  const left = Math.max(0, Math.round((until - Date.now()) / 1000));
  console.log(`  … ${left} sn kaldı · geçiş ${m.advance.length} · heartbeat ${m.heartbeat.length} (hata ${m.heartbeatErr})`);
}, 30_000);
await Promise.all([sampleDb(until), customerAdds(venueIds, songs, until), sleep(SECONDS * 1000)]);
clearInterval(progress);
stopping = true;
await sleep(3_000);
venues.forEach((v) => v.stop());
stopBus();
stopPhones.forEach((s) => s());

const minutes = SECONDS / 60;
console.log(`
Heartbeat (route sorguları)   ${line(m.heartbeat)} · hata ${m.heartbeatErr}
Şarkı geçişi (playNext)       ${line(m.advance)}
  sonuçlar                    ${JSON.stringify(m.advanceOutcome)}
Bitiş → yeni şarkı player'da  ${line(m.songGap)}
Peek (önyükleme)              ${line(m.peek)}
now_playing → player (pg_ch.) ${line(m.npDelivery)}
Broadcast teslimi (bus)       ${line(m.busDelivery)} · gönderilen ${m.busSent} alınan ${m.busRecv}
Panel/telefon okumaları       ${line(m.reads)} · hata ${m.readErr}
Kanal sorunları               ${Object.keys(m.channelProblems).length ? JSON.stringify(m.channelProblems) : "yok"}
DB bağlantısı (pg_stat)       ${m.dbConnections.length ? `min ${Math.min(...m.dbConnections)} · max ${Math.max(...m.dbConnections)}` : "ölçülmedi"}
Dakikada: heartbeat ${(m.heartbeat.length / minutes).toFixed(0)} · broadcast ${(m.busSent / minutes).toFixed(0)} · geçiş ${(m.advance.length / minutes).toFixed(1)}`);
process.exit(0);
