#!/usr/bin/env node
/**
 * Filo yük testi: N mekan aynı anda açık — her mekanda player + panel (aynı sekme),
 * müşteri telefonları ve gerçek jetonla şarkı ekleyen müşteriler. Diğer yük
 * testlerinden farkı: player ve müşteri istekleri GERÇEK HTTP rotalarından geçer
 * (/api/player/[venueId], /api/queue), yani oturum çerezi, player-açık kapısı,
 * request_song (jeton + cooldown), after() içindeki fillQueue/playNext dahil.
 * Site, e2e'deki gibi staging'e bağlı yerelde derlenip açılır.
 * YALNIZCA test projesine (staging) karşı çalışır.
 *
 *   npm run load:fleet                                    # 50 mekan, 600 sn, mekan başına 2 telefon (1'i ekler)
 *   npm run load:fleet -- --venues 50 --phones 4          # Realtime bağlantı tavanını zorlar
 *   npm run load:fleet -- --storm                         # bütün şarkılar aynı saniyede biter
 *   npm run load:fleet -- --base http://localhost:3100    # açık sunucuyu kullan (yoksa derleyip açar)
 *
 * Mekan başına:
 *   player  — açılışta claim, 5 sn'de bir heartbeat, şarkı ortasında peek, bitişte
 *             next (kapıya takılırsa ended-verified, busy'de yeniden dener),
 *             1 sn'de bir player-bus yayını, player-queue + player-np aboneliği
 *   panel   — aynı Realtime bağlantısında admin-np/admin-queue/sidebar/playlist
 *             abonelikleri, her olayda okuma
 *   telefon — sayfa açılışı (HTML), katalog + kullanıcı durumu okumaları,
 *             venue-live aboneliği, olayda toplanmış yeniden okuma, ara ara
 *             gözat ↔ sıra sayfası geçişi
 *   ekleyen — gerçek kullanıcı oturumu + mekan çerezi, ortalama --add-sec'te bir
 *             POST /api/queue (bir kısmı öncelikli), başka mekana eklemeye çalışıp
 *             403 aldığını da bir kez doğrular
 *
 * Sonda veritabanından bütünlük denetimi: kaybolan ekleme, jeton tutarlılığı,
 * sıra kuralı (müşteri şarkısı beklerken otomatik şarkı başlamaz, öncelikli
 * önce çalar), mekan başına tek "playing" satırı.
 *
 * Test mekanları `yuk-filo-NN`, test kullanıcıları `yuk-filo-uNNN@example.com`.
 * Kullanıcı oturumları node_modules/.cache/ altında saklanır: staging'de giriş
 * ~30 istek/5 dk ile sınırlı, ilk koşu kullanıcı açarken bekleyebilir.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";

const ROOT = join(import.meta.dirname, "..");
process.chdir(ROOT);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const jiti = createJiti(join(ROOT, "/"), { alias: { "@": ROOT } });
const { E2E, E2E_SESSION_SECRET } = (await jiti.import(join(ROOT, "e2e/env.ts"))) as typeof import("../e2e/env.ts");
const URL_ = E2E.serverEnv.NEXT_PUBLIC_SUPABASE_URL;
const ANON = E2E.serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = E2E.serverEnv.SUPABASE_SERVICE_ROLE_KEY;
// lib/ kodu (fillQueue) bu değişkenlerle staging'e bağlanır — prod anahtarı asla okunmaz
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;

const BASE = arg("base", "http://localhost:3100");
const VENUES = Number(arg("venues", "50"));
const PHONES = Number(arg("phones", "2"));
const ADDERS = Math.min(PHONES, Number(arg("adders", "1")));
const SECONDS = Number(arg("seconds", "600"));
const SONG_MS = Number(arg("song-sec", "60")) * 1000;
const ADD_MS = Number(arg("add-sec", "45")) * 1000;
const PRIORITY_RATE = Number(arg("priority", "0.15"));
const REMOTES = Math.min(VENUES, Number(arg("remotes", "5")));
// Mekanlar ve telefonlar bu süreye yayılarak açılır: hepsi aynı saniyede
// açılsa Realtime'ın "saniyede kanal katılımı" sınırına takılırdı, gerçekte de böyle olmaz
const OPEN_MS = Number(arg("open-sec", "60")) * 1000;
const STORM = flag("storm");
const SONG_COUNT = 150;
const START_BALANCE = 1000;
const HEARTBEAT_MS = 5_000;
const STATE_BEAT_MS = 1_000;
const RECONCILE_MS = 15_000;
const HTTP_TIMEOUT_MS = 20_000;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const queueFill = (await jiti.import(join(ROOT, "lib/queue-fill.ts"))) as typeof import("../lib/queue-fill.ts");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ── Sunucu ──────────────────────────────────────────────────────────────────
let server: ChildProcess | null = null;
const stopServer = () => server?.kill("SIGTERM");

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5_000), redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable()) {
    console.log(`sunucu açık: ${BASE} (staging'e bağlı olduğundan emin ol — e2e sunucusu öyledir)`);
    return;
  }
  const port = new URL(BASE).port || "3100";
  console.log(`sunucu yok — staging'e bağlı derlenip :${port}'de açılıyor (1-3 dk)…`);
  server = spawn("sh", ["-c", `npx next build && npx next start -p ${port}`], {
    cwd: ROOT,
    env: { ...process.env, ...E2E.serverEnv },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  server.stderr?.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
  const until = Date.now() + 360_000;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error(`sunucu açılamadı:\n${stderr}`);
    if (await reachable()) return;
    await sleep(3_000);
  }
  throw new Error("sunucu 6 dk içinde açılmadı");
}

// ── Tohumlama ───────────────────────────────────────────────────────────────
type Song = { id: string; youtube_video_id: string };
type Venue = { n: number; id: string; slug: string; adminCookie: string };

async function seedSongs(): Promise<Song[]> {
  return must(
    await admin
      .from("songs")
      .upsert(
        Array.from({ length: SONG_COUNT }, (_, i) => ({
          youtube_video_id: `yukfilo${String(i).padStart(3, "0")}`,
          title: `Yük Filo ${i + 1}`,
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

function signAdminCookie(adminId: string, sessionVersion: number, venueId: string, slug: string) {
  // lib/session.ts signSession ile aynı biçim; sunucu teste özel E2E_SESSION_SECRET ile çalışır
  const payload = {
    kind: "admin",
    admin_id: adminId,
    venue_id: venueId,
    venue_slug: slug,
    exp: Math.floor(Date.now() / 1000) + 4 * 3600,
    sv: sessionVersion,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", E2E_SESSION_SECRET).update(body).digest("base64url");
  return `admin_session=${body}.${sig}`;
}

async function seedVenue(n: number, songs: Song[]): Promise<Venue> {
  const slug = `yuk-filo-${String(n).padStart(2, "0")}`;
  const venue = must(
    await admin.from("venues").upsert({ slug, name: `Yük Filo ${n}` }, { onConflict: "slug" }).select("id").single(),
    "mekan",
  ) as { id: string };
  const venueId = venue.id;
  for (const table of ["queue", "song_requests", "one_time_songs", "playlists"]) {
    must(await admin.from(table).delete().eq("venue_id", venueId).select("venue_id"), `${table} temizliği`);
  }
  must(
    await admin.from("venue_songs").upsert(
      songs.map((s) => ({ venue_id: venueId, song_id: s.id })),
      { onConflict: "venue_id,song_id", ignoreDuplicates: true },
    ),
    "katalog",
  );
  must(
    await admin.from("venue_songs").update({ in_venue_list: true, playlist_visible: true }).eq("venue_id", venueId).select("venue_id"),
    "katalog görünürlüğü",
  );
  // Otomatik doldurma gerçekte aktif listelerden çalışır (bkz. lib/queue-fill.ts)
  const playlist = must(
    await admin.from("playlists").insert({ venue_id: venueId, name: "Yük Listesi", is_active: true }).select("id").single(),
    "liste",
  ) as { id: string };
  must(
    await admin.from("playlist_songs").insert(
      songs.map((s, i) => ({ venue_id: venueId, playlist_id: playlist.id, song_id: s.id, position: i })),
    ),
    "liste şarkıları",
  );

  const offset = STORM ? 0 : Math.floor(Math.random() * SONG_MS * 0.8);
  const startedAt = new Date(Date.now() - offset).toISOString();
  const first = songs[n % songs.length];
  must(
    await admin.from("queue").insert({
      venue_id: venueId, song_id: first.id, status: "playing", priority: false, position: 9000,
      added_by: "auto", tokens_spent: 0, started_at: startedAt, source_playlist_id: playlist.id,
    }),
    "çalan satır",
  );
  must(
    await admin.from("now_playing").upsert(
      {
        venue_id: venueId, song_id: first.id, video_id: first.youtube_video_id, is_playing: true,
        started_at: startedAt, progress_ms: offset, last_heartbeat_at: new Date().toISOString(),
        player_claim: null, player_claim_at: null, customer_adds_paused_at: null,
      },
      { onConflict: "venue_id" },
    ),
    "çalan şarkı",
  );
  await queueFill.fillQueue(venueId);

  const existing = must(
    await admin.from("venue_admins").select("id, session_version").eq("venue_id", venueId).eq("username", `${slug}-admin`),
    "admin",
  ) as { id: string; session_version: number | null }[];
  let adminRow = existing[0];
  if (adminRow) {
    must(await admin.from("venue_admins").update({ google_link_required: false }).eq("id", adminRow.id).select("id"), "admin güncelleme");
  } else {
    adminRow = must(
      await admin
        .from("venue_admins")
        .insert({ venue_id: venueId, username: `${slug}-admin`, password_hash: "yuk-not-a-real-hash", google_link_required: false })
        .select("id, session_version")
        .single(),
      "admin açma",
    ) as { id: string; session_version: number | null };
  }
  return { n, id: venueId, slug, adminCookie: signAdminCookie(adminRow.id, Number(adminRow.session_version ?? 1), venueId, slug) };
}

// ── Test kullanıcıları ──────────────────────────────────────────────────────
type Session = { user_id: string; access_token: string; refresh_token: string; expires_at: number };
type Customer = { userId: string; accessToken: string; cookies: string; startBalance: number };

const CACHE_DIR = join(ROOT, "node_modules/.cache");
const CACHE_FILE = join(CACHE_DIR, "pmj-load-fleet-sessions.json");
const PASSWORD = "yuk-filo-Passw0rd!";

function readCache(): Record<string, Session> {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeCache(cache: Record<string, Session>) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

async function sessionFor(email: string, cache: Record<string, Session>): Promise<Session> {
  const cached = cache[email];
  const needUntil = Date.now() / 1000 + SECONDS + 900;
  if (cached && cached.expires_at > needUntil) return cached;
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  if (cached) {
    const { data, error } = await anon.auth.refreshSession({ refresh_token: cached.refresh_token });
    if (!error && data.session) return store(email, data.session, cache);
  }
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error && !/already/i.test(created.error.message)) throw new Error(`kullanıcı ${email}: ${created.error.message}`);
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    if (!error && data.session) return store(email, data.session, cache);
    if (error?.status !== 429 || attempt > 40) throw new Error(`giriş ${email}: ${error?.message}`);
    if (attempt === 0) console.log(`  giriş sınırı (429) — bekleniyor; oturumlar saklanır, sonraki koşular beklemez`);
    await sleep(20_000);
  }
}

function store(email: string, s: { user: { id: string }; access_token: string; refresh_token: string; expires_at?: number }, cache: Record<string, Session>) {
  cache[email] = { user_id: s.user.id, access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? 0 };
  writeCache(cache);
  return cache[email];
}

// Supabase oturum çerezini @supabase/ssr'nin kendisine yazdırır: biçim ve
// parçalama sunucunun okuduğuyla birebir aynı olur
async function authCookies(session: Session): Promise<string> {
  const jar = new Map<string, string>();
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))),
    },
  });
  const { error } = await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new Error(`oturum çerezi: ${error.message}`);
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function prepareCustomers(count: number): Promise<Customer[]> {
  const cache = readCache();
  const out: Customer[] = [];
  for (let i = 0; i < count; i++) {
    const email = `yuk-filo-u${String(i).padStart(3, "0")}@example.com`;
    const s = await sessionFor(email, cache);
    const { data: w } = await admin.from("user_wallets").select("balance").eq("user_id", s.user_id).maybeSingle();
    const balance = (w as { balance: number } | null)?.balance ?? 0;
    if (balance < START_BALANCE) {
      must(
        await admin.rpc("add_tokens", { p_user_id: s.user_id, p_amount: START_BALANCE - balance, p_venue_id: null, p_kind: "grant" }),
        "jeton",
      );
    }
    const after = (await admin.from("user_wallets").select("balance").eq("user_id", s.user_id).single()).data as { balance: number };
    out.push({ userId: s.user_id, accessToken: s.access_token, cookies: await authCookies(s), startBalance: after.balance });
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${count} müşteri hazır`);
  }
  return out;
}

// ── Ölçüm ───────────────────────────────────────────────────────────────────
const m = {
  http: {} as Record<string, number[]>,
  httpStatus: {} as Record<string, number>,
  heartbeat: [] as number[],
  advanceOutcome: {} as Record<string, number>,
  songGap: [] as number[],
  overrun: [] as number[],
  busDelivery: [] as number[],
  busSent: 0,
  busRecv: 0,
  reads: [] as number[],
  readErr: 0,
  pages: [] as number[],
  pageStatus: {} as Record<string, number>,
  adds: [] as number[],
  addOutcome: {} as Record<string, number>,
  addSeen: [] as number[],
  crossVenue: {} as Record<string, number>,
  channelProblems: {} as Record<string, number>,
  rtEvents: new Map<number, number>(),
  connections: 0,
  multiPlaying: 0,
  liveSamples: 0,
};

const bump = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);
const rt = () => {
  const s = Math.floor(Date.now() / 1000);
  m.rtEvents.set(s, (m.rtEvents.get(s) ?? 0) + 1);
};

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}
const line = (v: number[]) => `n=${v.length} p50 ${pct(v, 50)} · p95 ${pct(v, 95)} · max ${pct(v, 100)} ms`;

let stopping = false;
function watch(name: string) {
  return (status: string, err?: Error) => {
    if (status === "SUBSCRIBED") return;
    if (status === "CLOSED" && stopping) return;
    bump(m.channelProblems, `${name}:${status}${err?.message ? ` (${err.message.slice(0, 80)})` : ""}`);
  };
}

function rtClient(accessToken?: string): SupabaseClient {
  m.connections += 1;
  return createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken ? { accessToken: async () => accessToken } : {}),
  });
}

async function timedRead(fn: () => PromiseLike<{ error: unknown }>) {
  const t0 = performance.now();
  try {
    const { error } = await fn();
    if (error) m.readErr += 1;
    else m.reads.push(performance.now() - t0);
  } catch {
    m.readErr += 1;
  }
}

async function http(kind: string, path: string, init: { cookie: string; body?: unknown }): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.body === undefined ? "GET" : "POST",
      headers: { cookie: init.cookie, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "manual",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    (m.http[kind] ??= []).push(performance.now() - t0);
    bump(m.httpStatus, `${kind}:${res.status}`);
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json };
  } catch (e) {
    bump(m.httpStatus, `${kind}:${(e as Error).name === "TimeoutError" ? "zaman aşımı" : "ağ hatası"}`);
    return { status: 0, json: null };
  }
}

// ── Mekan: player + panel aynı sekmede (tek Realtime bağlantısı) ─────────────
function startVenue(venue: Venue, until: number) {
  const venueId = venue.id;
  const tab = rtClient();
  const claimId = crypto.randomUUID();
  const state = { videoId: "", songStartedAt: 0, endedAt: 0, endedFrom: "", peeked: false, advancing: false, first: true };
  const timers: ReturnType<typeof setInterval>[] = [];
  const api = (action: string, extra: Record<string, unknown> = {}) =>
    http(`player:${action}`, `/api/player/${venueId}`, { cookie: venue.adminCookie, body: { action, claim_id: claimId, ...extra } });

  const bus = tab.channel(`player-bus:${venueId}`, { config: { broadcast: { self: false, ack: false } } });
  bus.on("broadcast", { event: "cmd" }, () => rt()).subscribe(watch("player-bus"));
  tab
    .channel(`player-queue:${venueId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueId}` }, () => rt())
    .subscribe(watch("player-queue"));
  tab
    .channel(`player-np:${venueId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueId}` }, (p: { new: { video_id: string | null } }) => {
      rt();
      const v = p.new.video_id;
      if (v && state.endedAt && v !== state.endedFrom) {
        m.songGap.push(Date.now() - state.endedAt);
        state.endedAt = 0;
      }
    })
    .subscribe(watch("player-np"));

  // Panel: usePlayback'in okumaları + kenar çubuğu/kütüphane abonelikleri
  const fetchNp = () => timedRead(() => tab.from("now_playing").select("video_id, song_id, is_playing, started_at, progress_ms, last_heartbeat_at, volume").eq("venue_id", venueId).maybeSingle());
  const reloadQueue = () => timedRead(() => tab.rpc("get_queue_state", { p_venue_id: venueId }));
  const sfx = Math.random().toString(36).slice(2);
  tab
    .channel(`admin-np:${venueId}:${sfx}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueId}` }, () => {
      rt();
      void fetchNp();
    })
    .subscribe(watch("admin-np"));
  tab
    .channel(`admin-queue:${venueId}:${sfx}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueId}` }, () => {
      rt();
      void reloadQueue();
    })
    .subscribe(watch("admin-queue"));
  tab
    .channel(`sidebar_requests:${venueId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "song_requests", filter: `venue_id=eq.${venueId}` }, () => rt())
    .subscribe(watch("sidebar"));
  tab
    .channel(`venue_playlists:${venueId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "playlists", filter: `venue_id=eq.${venueId}` }, () => rt())
    .subscribe(watch("playlists"));

  const heartbeat = async () => {
    const t0 = performance.now();
    const r = await api("heartbeat", { progress_ms: Math.max(Date.now() - state.songStartedAt, 0), is_playing: true, video_id: state.videoId });
    if (r.status === 200) m.heartbeat.push(performance.now() - t0);
    if (r.json?.claim_lost) bump(m.advanceOutcome, "heartbeat:claim_lost");
  };

  const advance = async () => {
    if (state.advancing) return;
    state.advancing = true;
    state.endedAt = Date.now();
    state.endedFrom = state.videoId;
    const from = state.videoId;
    let reason: string | undefined;
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const r = await api("next", { from_video_id: from, ...(reason ? { reason } : {}) });
        const j = r.json ?? {};
        const o =
          r.status === 503 ? "busy"
          : r.status === 409 ? "claim_lost"
          : r.status !== 200 ? `http-${r.status}`
          : j.kept ? "kept"
          : j.queueEmpty ? "queueEmpty"
          : j.started ? "started"
          : "other";
        bump(m.advanceOutcome, o);
        if (o === "started" && typeof j.video_id === "string") {
          if (j.video_id !== state.videoId) {
            // İlk şarkı tohumlamadan kalma: hazırlık uzun sürdüyse çoktan bitmiştir
            if (!state.first) m.overrun.push(Date.now() - state.songStartedAt - SONG_MS);
            state.first = false;
            state.videoId = j.video_id;
            state.songStartedAt = Date.now();
            state.peeked = false;
          }
          return;
        }
        if (o === "queueEmpty" || o === "claim_lost") return;
        // Kapıya takılırsa player videonun gerçekten bittiğini doğrulayıp zorlar
        if (o === "kept") reason = "ended-verified";
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
      void api("peek");
    }
    if (elapsed >= SONG_MS) void advance();
  };

  const beat = () => {
    m.busSent += 1;
    rt();
    try {
      void bus.send({ type: "broadcast", event: "state", payload: { video_id: state.videoId, is_playing: true, progress_ms: Date.now() - state.songStartedAt, at: Date.now(), started: true } });
    } catch {}
  };

  const start = async (videoId: string, startedAt: number) => {
    state.videoId = videoId;
    state.songStartedAt = startedAt;
    await api("claim");
    void fetchNp();
    void reloadQueue();
    timers.push(setInterval(() => void heartbeat(), HEARTBEAT_MS));
    timers.push(setInterval(beat, STATE_BEAT_MS));
    timers.push(setInterval(() => void timedRead(() => tab.from("now_playing").select("video_id, song_id, is_playing, started_at, volume, crossfade_ms").eq("venue_id", venueId).maybeSingle()), RECONCILE_MS));
    timers.push(setInterval(tick, 250));
    void heartbeat();
  };

  return {
    start,
    stop: () => {
      timers.forEach(clearInterval);
      void tab.removeAllChannels();
    },
  };
}

// Mekan sahibinin telefonundaki kumanda: player-bus'ı dinler (yayın teslim süresi)
function startRemote(venueId: string) {
  const c = rtClient();
  c.channel(`player-bus:${venueId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "state" }, ({ payload }: { payload: { at: number } }) => {
      rt();
      m.busRecv += 1;
      m.busDelivery.push(Date.now() - payload.at);
    })
    .subscribe(watch("remote"));
  return () => void c.removeAllChannels();
}

// ── Müşteri telefonu ────────────────────────────────────────────────────────
// Eklenen şarkının aynı mekandaki diğer telefonlara ulaşma süresi için
const pendingAdds = new Map<string, number>();

function startPhone(venue: Venue, others: Venue[], customer: Customer | null, until: number) {
  const venueId = venue.id;
  const c = rtClient(customer?.accessToken);
  const cookie = customer ? `${customer.cookies}; venue_auth_${venue.slug}=${customer.userId}; venue_member_${venue.slug}=1` : "";
  let page: "browse" | "queue" = "browse";
  let catalog: string[] = [];
  let pending: ReturnType<typeof setTimeout> | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const openPage = async (p: "browse" | "queue") => {
    page = p;
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}/venue/${venue.slug}/${p}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
      await res.arrayBuffer();
      m.pages.push(performance.now() - t0);
      bump(m.pageStatus, `${p}:${res.status}`);
    } catch (e) {
      bump(m.pageStatus, `${p}:${(e as Error).name}`);
    }
    if (p === "browse") {
      await Promise.all([
        timedRead(async () => {
          const r = await c.from("venue_songs").select("play_count, in_venue_list, playlist_visible, songs(id, youtube_video_id, title, artist, album_cover_url, duration_ms)").eq("venue_id", venueId).order("song_id").range(0, 999);
          if (!r.error) catalog = (r.data as unknown as { songs: { id: string } | null }[]).flatMap((x) => (x.songs ? [x.songs.id] : []));
          return r;
        }),
        refresh(),
        timedRead(() => c.from("now_playing").select("last_heartbeat_at").eq("venue_id", venueId).maybeSingle()),
      ]);
    } else {
      await refresh();
    }
  };

  const refresh = () =>
    page === "browse"
      ? Promise.all([
          timedRead(() => c.rpc("get_browse_user_state", { p_venue_id: venueId })),
          timedRead(() => c.from("now_playing").select("started_at, is_playing").eq("venue_id", venueId).maybeSingle()),
        ])
      : timedRead(() => c.rpc("get_queue_state", { p_venue_id: venueId }));

  c.channel(`venue-live:${venueId}`)
    .on("broadcast", { event: "*" }, (msg: { event: string; payload?: { added?: { song_id: string }[] } }) => {
      rt();
      if (msg.event === "beat") return;
      for (const a of msg.payload?.added ?? []) {
        const t = pendingAdds.get(`${venueId}:${a.song_id}`);
        if (t) m.addSeen.push(Date.now() - t);
      }
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void refresh();
      }, 150 + Math.random() * 600);
    })
    .subscribe(watch("phone-live"));

  const add = async () => {
    if (!customer || Date.now() > until - 15_000 || !catalog.length) return;
    const songId = catalog[Math.floor(Math.random() * catalog.length)];
    const priority = Math.random() < PRIORITY_RATE;
    const key = `${venueId}:${songId}`;
    const t0 = performance.now();
    pendingAdds.set(key, Date.now());
    const r = await http("queue:add", "/api/queue", { cookie, body: { venue_id: venueId, song_id: songId, priority } });
    if (r.status === 200) {
      m.adds.push(performance.now() - t0);
      okAdds.push({ venueId, userId: customer.userId, songId, priority, cost: Number(r.json?.cost ?? 0) });
      setTimeout(() => pendingAdds.delete(key), 15_000);
    } else {
      pendingAdds.delete(key);
    }
    bump(m.addOutcome, r.status === 200 ? (priority ? "ok (öncelikli)" : "ok") : `${r.status} ${String(r.json?.code ?? r.json?.error ?? "")}`.trim());
  };

  const loop = async () => {
    while (Date.now() < until && !stopping) {
      // Üstel bekleme: müşteriler birbirinden bağımsız, ortalama ADD_MS'de bir
      await sleep(-Math.log(1 - Math.random()) * ADD_MS);
      if (Math.random() < 0.15) await openPage(page === "browse" ? "queue" : "browse");
      if (customer) {
        if (page !== "browse") await openPage("browse");
        await add();
      }
    }
  };

  const start = async () => {
    await openPage("browse");
    if (customer && others.length) {
      // Bir mekanın çereziyle başka mekana ekleme: 403 dönmeli
      const other = others[Math.floor(Math.random() * others.length)];
      const r = await http("queue:cross", "/api/queue", { cookie, body: { venue_id: other.id, song_id: catalog[0] } });
      bump(m.crossVenue, String(r.status));
    }
    void loop();
  };

  return {
    start,
    stop: () => {
      timers.forEach(clearTimeout);
      if (pending) clearTimeout(pending);
      void c.removeAllChannels();
    },
  };
}

type OkAdd = { venueId: string; userId: string; songId: string; priority: boolean; cost: number };
const okAdds: OkAdd[] = [];

// Çalışırken: aynı mekanda iki "playing" satırı olmamalı
async function sampleLive(venueIds: string[], until: number) {
  while (Date.now() < until) {
    await sleep(15_000);
    const { data } = await admin.from("queue").select("venue_id").eq("status", "playing").in("venue_id", venueIds);
    if (!data) continue;
    m.liveSamples += 1;
    const count = new Map<string, number>();
    for (const r of data as { venue_id: string }[]) count.set(r.venue_id, (count.get(r.venue_id) ?? 0) + 1);
    m.multiPlaying += [...count.values()].filter((n) => n > 1).length;
  }
}

// ── Bütünlük denetimi ───────────────────────────────────────────────────────
type QRow = {
  venue_id: string; song_id: string; user_id: string | null; status: string; priority: boolean;
  added_at: string; started_at: string | null; tokens_spent: number | null; added_by: string | null;
};

async function integrity(venues: Venue[], customers: Customer[], since: string) {
  const ids = venues.map((v) => v.id);
  const rows: QRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(
      await admin
        .from("queue")
        .select("venue_id, song_id, user_id, status, priority, added_at, started_at, tokens_spent, added_by")
        .in("venue_id", ids)
        .order("added_at")
        .range(from, from + 999),
      "kuyruk okuma",
    ) as QRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const report: string[] = [];

  // 1) Başarılı her ekleme kuyrukta bir satır olmalı
  const custRows = rows.filter((r) => r.user_id && r.added_at >= since);
  const unmatched = [...custRows];
  let lost = 0;
  for (const a of okAdds) {
    const i = unmatched.findIndex((r) => r.venue_id === a.venueId && r.user_id === a.userId && r.song_id === a.songId);
    if (i >= 0) unmatched.splice(i, 1);
    else lost += 1;
  }
  report.push(`Kaybolan ekleme              ${lost} / ${okAdds.length} başarılı ekleme${unmatched.length ? ` · yanıtı 200 olmayan ama yazılmış ${unmatched.length}` : ""}`);

  // 2) Jeton: düşen bakiye = kuyruğa yazılan tutar
  let tokenMismatch = 0;
  for (const c of customers) {
    const { data } = await admin.from("user_wallets").select("balance").eq("user_id", c.userId).single();
    const spent = c.startBalance - (data as { balance: number }).balance;
    const charged = custRows.filter((r) => r.user_id === c.userId).reduce((s, r) => s + (r.tokens_spent ?? 0), 0);
    if (spent !== charged) tokenMismatch += 1;
  }
  const totalCharged = custRows.reduce((s, r) => s + (r.tokens_spent ?? 0), 0);
  report.push(`Jeton tutarsızlığı           ${tokenMismatch} / ${customers.length} kullanıcı · toplam düşülen ${totalCharged} jeton`);

  // 3) Sıra kuralı: müşteri şarkısı ≥5 sn bekliyorken otomatik şarkı başlamamalı;
  //    öncelikli bekliyorken normal müşteri şarkısı başlamamalı
  const SLACK = 5_000;
  let autoJumped = 0;
  let priorityJumped = 0;
  let multiPlaying = 0;
  let npMismatch = 0;
  const { data: nps } = await admin.from("now_playing").select("venue_id, song_id").in("venue_id", ids);
  for (const v of venues) {
    const vr = rows.filter((r) => r.venue_id === v.id && r.status !== "removed");
    const starts = vr.filter((r) => r.started_at && r.started_at >= since);
    for (const s of starts) {
      const t = Date.parse(s.started_at!);
      const waiting = vr.filter((w) => w.user_id && Date.parse(w.added_at) < t - SLACK && (!w.started_at || Date.parse(w.started_at) > t));
      if (!s.user_id && waiting.length) autoJumped += 1;
      if (s.user_id && !s.priority && waiting.some((w) => w.priority)) priorityJumped += 1;
    }
    const playing = vr.filter((r) => r.status === "playing");
    if (playing.length > 1) multiPlaying += 1;
    const np = (nps as { venue_id: string; song_id: string }[] | null)?.find((x) => x.venue_id === v.id);
    if (playing[0] && np && np.song_id !== playing[0].song_id) npMismatch += 1;
  }
  const starts = rows.filter((r) => r.started_at && r.started_at >= since);
  report.push(`Başlayan şarkı               ${starts.length} (müşteri ${starts.filter((r) => r.user_id).length}, otomatik ${starts.filter((r) => !r.user_id).length})`);
  report.push(`Sıra ihlali                  müşteri beklerken otomatik ${autoJumped} · öncelikli beklerken normal ${priorityJumped}`);
  report.push(`Sahne tutarlılığı (son)      2+ playing olan mekan ${multiPlaying} · now_playing≠playing ${npMismatch}`);
  const waitingAtEnd = rows.filter((r) => r.user_id && r.status === "queued").length;
  report.push(`Test sonunda sırada bekleyen müşteri şarkısı ${waitingAtEnd}`);
  return report;
}

// ── Çalıştır ────────────────────────────────────────────────────────────────
await ensureServer();
console.log(`hazırlık: ${VENUES} mekan, ${VENUES * ADDERS} müşteri hesabı…`);
const songs = await seedSongs();
// Tohumlama baştan tekrarlanabilir: arada kopan bir istek bütün koşuyu düşürmesin
const venues = await pool(Array.from({ length: VENUES }, (_, i) => i + 1), 8, async (n) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await seedVenue(n, songs);
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`  mekan ${n} tohumlanamadı (${(e as Error).message}), yeniden deneniyor`);
      await sleep(2_000);
    }
  }
});
// Yeniden denenen tohumlamada "başarısız" görünen bir istek sunucuda işlenmiş
// olabilir: sahnede ikinci bir playing satırı kalır ve testin "2+ playing"
// ölçümünü kirletir. Başlamadan önce en yeni playing satırı dışındakiler kapatılır
// (iki deneme de aynı ilk şarkıyı yazdığı için şarkıya göre ayırt edilemez).
for (const v of venues) {
  const playing = must(
    await admin.from("queue").select("id").eq("venue_id", v.id).eq("status", "playing").order("started_at", { ascending: false }),
    "sahne",
  ) as { id: string }[];
  if (playing.length > 1) {
    must(
      await admin.from("queue").update({ status: "played", played_at: new Date().toISOString() }).in("id", playing.slice(1).map((r) => r.id)).select("id"),
      "sahne tekilleştirme",
    );
  }
}
const customers = await prepareCustomers(VENUES * ADDERS);
const connectionsPlanned = VENUES * (1 + PHONES) + REMOTES;
console.log(
  `\nstaging · ${BASE} · ${VENUES} mekan · ${SECONDS} sn · şarkı ${SONG_MS / 1000} sn · ` +
    `${STORM ? "FIRTINA" : "dağınık tempo"} · mekan başına ${PHONES} telefon (${ADDERS}'i ekler, ort. ${ADD_MS / 1000} sn'de bir) · ` +
    `${REMOTES} kumanda · planlanan Realtime bağlantısı ${connectionsPlanned}`,
);

const since = new Date().toISOString();
const until = Date.now() + OPEN_MS + SECONDS * 1000;
const players = venues.map((v) => startVenue(v, until));
const remotes: (() => void)[] = [];
const phones: ReturnType<typeof startPhone>[] = [];
let adderIdx = 0;
for (const v of venues) {
  const others = venues.filter((o) => o !== v);
  for (let p = 0; p < PHONES; p++) phones.push(startPhone(v, others, p < ADDERS ? customers[adderIdx++] : null, until));
}

// Açılışlar OPEN_MS'e yayılır: önce mekanın player'ı, telefonlar ardından
const nps = must(await admin.from("now_playing").select("venue_id, video_id, started_at").in("venue_id", venues.map((v) => v.id)), "başlangıç") as { venue_id: string; video_id: string; started_at: string }[];
const openings: Promise<unknown>[] = [];
venues.forEach((v, i) => {
  const at = (i / VENUES) * OPEN_MS * 0.5;
  openings.push(
    sleep(at).then(async () => {
      await sleep(1_500); // abonelikler otursun
      const np = nps.find((r) => r.venue_id === v.id)!;
      await players[i].start(np.video_id, Date.parse(np.started_at));
      if (i < REMOTES) remotes.push(startRemote(v.id));
    }),
  );
});
phones.forEach((ph) => openings.push(sleep(OPEN_MS * 0.5 + Math.random() * OPEN_MS * 0.5).then(() => ph.start())));

const progress = setInterval(() => {
  const left = Math.max(0, Math.round((until - Date.now()) / 1000));
  const adds = Object.entries(m.addOutcome).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`  … ${left} sn kaldı · heartbeat ${m.heartbeat.length} · geçiş ${m.advanceOutcome.started ?? 0} · ekleme ${adds || "-"} · kanal sorunu ${Object.values(m.channelProblems).reduce((a, b) => a + b, 0)}`);
}, 30_000);
await Promise.all([...openings, sampleLive(venues.map((v) => v.id), until), sleep(until - Date.now())]);
clearInterval(progress);
stopping = true;
// after() içindeki fillQueue/playNext işleri bitsin
await sleep(5_000);
players.forEach((p) => p.stop());
phones.forEach((p) => p.stop());
remotes.forEach((r) => r());

const report = await integrity(venues, customers, since);

// Realtime olay hızı: istemci tarafında sayılan (gönderilen + alınan) mesajlar.
// Supabase "Messages per second" sınırı bunu sayar; açılış yayılımı hariç tutulur.
const steady = [...m.rtEvents.entries()].filter(([s]) => s * 1000 > Date.now() - SECONDS * 1000).map(([, n]) => n);
const windows: number[] = [];
for (let i = 0; i + 10 <= steady.length; i += 10) windows.push(steady.slice(i, i + 10).reduce((a, b) => a + b, 0) / 10);
const avgRate = steady.reduce((a, b) => a + b, 0) / Math.max(steady.length, 1);
const httpLines = Object.entries(m.http)
  .sort()
  .map(([k, v]) => `  ${k.padEnd(26)} ${line(v)}`)
  .join("\n");

console.log(`
── Player ──────────────────────────────────────────────
Heartbeat (HTTP, 200)        ${line(m.heartbeat)}
Şarkı geçişi sonuçları       ${JSON.stringify(m.advanceOutcome)}
Bitiş → yeni şarkı player'da ${line(m.songGap)}
Şarkı süresini aşma          ${line(m.overrun)}
Player-bus teslimi (kumanda) ${line(m.busDelivery)} · gönderilen ${m.busSent} alınan ${m.busRecv}
── Müşteri ─────────────────────────────────────────────
Sayfa açılışı (yerel sunucu) ${line(m.pages)} · ${JSON.stringify(m.pageStatus)}
Okumalar (RLS, telefon+panel) ${line(m.reads)} · hata ${m.readErr}
Şarkı ekleme (POST, 200)     ${line(m.adds)}
  sonuçlar                   ${JSON.stringify(m.addOutcome)}
Ekleme → diğer telefonda     ${line(m.addSeen)}
Başka mekana ekleme denemesi ${JSON.stringify(m.crossVenue)} (hepsi 403 olmalı)
── Altyapı ─────────────────────────────────────────────
HTTP uçları
${httpLines}
HTTP durum kodları           ${JSON.stringify(m.httpStatus)}
Realtime bağlantısı          ${m.connections} (Free tavanı 200, Pro 500)
Realtime mesaj/sn            ort. ${avgRate.toFixed(0)} · en yoğun 10 sn ${Math.max(0, ...windows).toFixed(0)} (Free tavanı 100, Pro 500)
Kanal sorunları              ${Object.keys(m.channelProblems).length ? JSON.stringify(m.channelProblems) : "yok"}
Çalışırken 2+ playing        ${m.multiPlaying} (${m.liveSamples} örnek)
── Bütünlük (veritabanı) ───────────────────────────────
${report.join("\n")}`);

stopServer();
process.exit(0);
