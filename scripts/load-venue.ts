#!/usr/bin/env node
/**
 * Tek mekan yük testi: N telefon + 5 sn'de bir heartbeat yollayan bir player.
 * Müşteri ekranlarının veritabanına bindirdiği yükü ve canlı mesaj gecikmesini
 * ölçer. YALNIZCA test projesine (staging) karşı çalışır.
 *
 *   npm run load:venue                                   # 50 telefon, 60 sn, iki mod
 *   npm run load:venue -- --phones 100 --seconds 120
 *   npm run load:venue -- --mode live                    # yalnızca yeni hat
 *   npm run load:venue -- --song-sec 210 --add-sec 60    # gerçekçi akşam temposu
 *
 * Modlar:
 *   legacy — 0060 öncesi istemci: queue + now_playing postgres_changes, her
 *            olayda yeniden okuma, oynatıcı-açık kontrolü 10 sn'de bir okuma.
 *   live   — lib/venue-live.ts: `venue-live:<id>` Broadcast, yalnızca anlamlı
 *            değişiklikte (toplanmış + yayılmış) okuma.
 *
 * Telefon başına istek sayısı gerçek ekranın (sıra sayfası + oynatıcı-açık
 * kancası) attığı istekleri taklit eder ve istekler GERÇEKTEN atılır — ölçülen
 * gecikme yük altındaki veritabanınındır. Test mekanı `yuk-testi` (e2e'nin
 * mekanına dokunmaz).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ROOT = join(import.meta.dirname, "..");
const VENUE_SLUG = "yuk-testi";
const HEARTBEAT_MS = 5_000;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

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

const PHONES = Number(arg("phones", "50"));
const SECONDS = Number(arg("seconds", "60"));
// Varsayılanlar bilerek yoğun: gerçek bir akşamda şarkı ~3,5 dk'da bir değişir
const SONG_CHANGE_MS = Number(arg("song-sec", "20")) * 1000;
const CUSTOMER_ADD_MS = Number(arg("add-sec", "15")) * 1000;
const MODES = arg("mode", "both") === "both" ? ["legacy", "live"] : [arg("mode", "live")];

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

// ── Test mekanı ─────────────────────────────────────────────────────────────
async function seedVenue() {
  const venue = must(
    await admin.from("venues").upsert({ slug: VENUE_SLUG, name: "Yük Testi" }, { onConflict: "slug" }).select("id").single(),
    "mekan",
  ) as { id: string };
  // Sentetik şarkılar: hiçbir yerde çalınmaz, yalnızca satır olarak var
  const songs = must(
    await admin
      .from("songs")
      .upsert(
        Array.from({ length: 20 }, (_, i) => ({
          youtube_video_id: `yuktesti${String(i).padStart(3, "0")}`,
          title: `Yük Testi ${i + 1}`,
          artist: "PMJ",
          duration_ms: 210_000,
        })),
        { onConflict: "youtube_video_id" },
      )
      .select("id, youtube_video_id"),
    "şarkılar",
  ) as { id: string; youtube_video_id: string }[];

  must(await admin.from("queue").delete().eq("venue_id", venue.id).select("id"), "kuyruk temizliği");
  const existing = new Set(
    (must(await admin.from("venue_songs").select("song_id").eq("venue_id", venue.id), "katalog") as { song_id: string }[]).map((r) => r.song_id),
  );
  const missing = songs.filter((s) => !existing.has(s.id)).map((s) => ({ venue_id: venue.id, song_id: s.id }));
  if (missing.length) must(await admin.from("venue_songs").insert(missing).select("id"), "katalog ekleme");
  must(
    await admin
      .from("now_playing")
      .upsert({ venue_id: venue.id, song_id: songs[0].id, video_id: songs[0].youtube_video_id, is_playing: true, started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() }, { onConflict: "venue_id" })
      .select("venue_id"),
    "çalan şarkı",
  );
  must(
    await admin
      .from("queue")
      .insert(songs.slice(1, 11).map((s, i) => ({ venue_id: venue.id, song_id: s.id, status: "queued", priority: false, position: i + 1, added_by: "yük testi", tokens_spent: 0 })))
      .select("id"),
    "kuyruk",
  );
  return { venueId: venue.id, songs };
}

// ── Ölçüm ───────────────────────────────────────────────────────────────────
type Stats = { requests: number; latencies: number[]; deliveries: number[]; events: number };

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}

async function timed(stats: Stats, fn: () => PromiseLike<unknown>) {
  const t0 = performance.now();
  stats.requests += 1;
  await fn();
  stats.latencies.push(performance.now() - t0);
}

function coalesce(fn: () => void, baseMs = 150, jitterMs = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, baseMs + Math.random() * jitterMs);
  };
}

// Anlamlı son yazımın zamanı: teslim gecikmesi buna göre ölçülür
let lastWriteAt = 0;

function startPhone(mode: string, venueId: string, stats: Stats): { client: SupabaseClient; stop: () => void } {
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const getState = () => timed(stats, () => client.rpc("get_queue_state", { p_venue_id: venueId }));
  const getWait = () => timed(stats, () => client.from("queue").select("song_id, priority, position").eq("venue_id", venueId).eq("status", "queued"));
  const getBeat = () => timed(stats, () => client.from("now_playing").select("last_heartbeat_at").eq("venue_id", venueId).maybeSingle());
  const onEvent = () => {
    stats.events += 1;
    const since = Date.now() - lastWriteAt;
    if (lastWriteAt && since < 10_000) stats.deliveries.push(since);
  };

  const timers: ReturnType<typeof setInterval>[] = [];
  if (mode === "legacy") {
    client
      .channel(`q:${venueId}:${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueId}` }, () => {
        onEvent();
        void getState();
        void getWait();
      })
      .subscribe();
    client
      .channel(`np:${venueId}:${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueId}` }, () => {
        onEvent();
        void getState();
        void getBeat();
      })
      .subscribe();
    timers.push(setInterval(() => void getBeat(), 10_000));
  } else {
    const refreshState = coalesce(() => void getState());
    const refreshWait = coalesce(() => void getWait());
    client
      .channel(`venue-live:${venueId}`)
      .on("broadcast", { event: "*" }, (msg: { event: string }) => {
        if (msg.event === "beat") return;
        onEvent();
        refreshState();
        if (msg.event === "queue") refreshWait();
      })
      .subscribe();
  }
  void getState();
  void getWait();
  void getBeat();
  return {
    client,
    stop: () => {
      timers.forEach(clearInterval);
      void client.removeAllChannels();
    },
  };
}

// ── Player simülasyonu ──────────────────────────────────────────────────────
async function runPlayer(mode: string, venueId: string, songs: { id: string; youtube_video_id: string }[], seconds: number) {
  const until = Date.now() + seconds * 1000;
  let songStartedAt = Date.now();
  let songIndex = 0;
  let nextHeartbeat = Date.now();
  let nextChange = Date.now() + SONG_CHANGE_MS;
  let nextAdd = Date.now() + CUSTOMER_ADD_MS;
  let writes = 0;

  while (Date.now() < until) {
    const now = Date.now();
    if (now >= nextHeartbeat) {
      nextHeartbeat += HEARTBEAT_MS;
      // Rota ile aynı: progress + çapa + canlılık (bkz. app/api/player/[venueId])
      const progress = now - songStartedAt + Math.round(Math.random() * 300 - 150);
      // Eski hatta heartbeat de telefonlara ulaşan bir olaydır
      if (mode === "legacy") lastWriteAt = Date.now();
      await admin
        .from("now_playing")
        .update({ progress_ms: progress, is_playing: true, last_heartbeat_at: new Date().toISOString(), started_at: new Date(now - progress).toISOString() })
        .eq("venue_id", venueId);
      writes += 1;
    }
    if (now >= nextChange) {
      nextChange += SONG_CHANGE_MS;
      songIndex = (songIndex + 1) % songs.length;
      songStartedAt = Date.now();
      const next = songs[songIndex];
      lastWriteAt = Date.now();
      const { data: head } = await admin
        .from("queue")
        .select("id")
        .eq("venue_id", venueId)
        .eq("status", "queued")
        .order("position", { ascending: true })
        .limit(1);
      if (head?.[0]) await admin.from("queue").update({ status: "played", played_at: new Date().toISOString() }).eq("id", head[0].id);
      await admin
        .from("now_playing")
        .update({ song_id: next.id, video_id: next.youtube_video_id, started_at: new Date().toISOString(), progress_ms: 0, is_playing: true })
        .eq("venue_id", venueId);
      writes += 2;
    }
    if (now >= nextAdd) {
      nextAdd += CUSTOMER_ADD_MS;
      const s = songs[Math.floor(Math.random() * songs.length)];
      lastWriteAt = Date.now();
      await admin.from("queue").insert({ venue_id: venueId, song_id: s.id, status: "queued", priority: false, position: 1000 + Math.floor(now / 1000) % 100000, added_by: "yük testi", tokens_spent: 0 });
      writes += 1;
    }
    await sleep(100);
  }
  return writes;
}

// ── Çalıştır ────────────────────────────────────────────────────────────────
const { venueId, songs } = await seedVenue();
console.log(`staging · mekan ${VENUE_SLUG} · ${PHONES} telefon · ${SECONDS} sn\n`);

const results: Record<string, Stats & { writes: number }> = {};
for (const mode of MODES) {
  lastWriteAt = 0;
  const stats: Stats = { requests: 0, latencies: [], deliveries: [], events: 0 };
  const phones = Array.from({ length: PHONES }, () => startPhone(mode, venueId, stats));
  await sleep(4_000); // abonelikler otursun
  const warm = stats.requests;
  stats.requests = 0;
  stats.latencies = [];
  stats.events = 0;
  const writes = await runPlayer(mode, venueId, songs, SECONDS);
  await sleep(2_000);
  phones.forEach((p) => p.stop());
  results[mode] = { ...stats, writes };
  const perPhoneMin = (stats.requests / PHONES) * (60 / SECONDS);
  console.log(
    `${mode.padEnd(7)} açılış ${warm} istek · test süresince ${stats.requests} istek ` +
      `(telefon başına dakikada ${perPhoneMin.toFixed(1)}) · canlı olay ${stats.events} · ` +
      `istek gecikmesi p50 ${pct(stats.latencies, 50)} ms p95 ${pct(stats.latencies, 95)} ms · ` +
      `mesaj teslimi p50 ${pct(stats.deliveries, 50)} ms p95 ${pct(stats.deliveries, 95)} ms`,
  );
  await sleep(3_000);
}

if (results.legacy && results.live) {
  const ratio = results.legacy.requests / Math.max(results.live.requests, 1);
  console.log(`\nyeni hat eskisine göre ${ratio.toFixed(1)}× daha az veritabanı isteği`);
}
process.exit(0);
