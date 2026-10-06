#!/usr/bin/env node
/**
 * Mekanlar haritası yük testi: N kişi aynı anda haritayı açıp mekanlara dokunuyor.
 * YALNIZCA test projesine (staging) karşı veri kurar; istekler verilen sunucuya
 * gider (staging env'iyle çalışan yerel `next start` ya da bir preview).
 *
 *   npm run load:map -- --base http://localhost:3200              # 100 kişi, 60 sn
 *   npm run load:map -- --base http://localhost:3200 --users 300 --seconds 120
 *   npm run load:map -- --warm        # tür önbelleği sıfırlanmaz (ılık başlangıç)
 *   npm run load:map -- --cleanup     # test mekanlarını ve verisini sil
 *
 * Senaryo:
 *   1) Sürü: herkes AYNI ANDA sayfayı açar ve aynı mekana dokunur. En kötü an —
 *      tür önbelleği soğukken (varsayılan) her istek iTunes'a gitmek isteyebilir.
 *   2) Akış: herkes 2-6 sn'de bir rastgele mekana dokunur, arada sayfayı yeniler.
 *
 * Yerel sunucuda CDN yok: her istek fonksiyona ve veritabanına ulaşır. Canlıda
 * kart yanıtı CDN'de 20 sn tutulduğu için gerçek yük bundan çok daha az —
 * buradaki sonuç üst sınırdır.
 *
 * Test verisi: konumlu 5 mekan (`harita-yuk-1..5`), gerçek sanatçı adlarıyla
 * şarkılar, mekan başına ~2000 çalma kaydı, 10 şarkılık sıra, çalan şarkı.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
if (!env.STAGING_SUPABASE_URL || !env.STAGING_SERVICE_ROLE_KEY) {
  console.error(".env.new içinde STAGING_SUPABASE_URL / STAGING_SERVICE_ROLE_KEY yok");
  process.exit(1);
}
const db = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BASE = arg("base", "http://localhost:3200").replace(/\/$/, "");
const USERS = Number(arg("users", "100"));
const SECONDS = Number(arg("seconds", "60"));
const VENUES = 5;
const PLAYS_PER_VENUE = 2000;

// Canlıdaki mekanlarda gerçekten çalınan türden isimler — iTunes araması gerçekçi olsun
const ARTISTS = [
  "Claptone", "The Avener", "COEO", "Mecdoux", "Lvbel C5", "GAMPER & DADONI", "Mr. Chillout",
  "Gregory Porter", "Just Be Cool", "The Weeknd", "HUGEL", "Alok", "Parra For Cuva", "Butia",
  "Milk & Sugar", "Michael Calfan", "Fugees", "Sezen Aksu", "Duman", "Ezhel", "Tarkan",
  "Müslüm Gürses", "Manifest", "Dua Lipa", "Mabel Matiz", "Sertab Erener", "Teoman", "Mor ve Ötesi",
  "Ceza", "Sagopa Kajmer", "Ben Fero", "Uzi", "Motive", "Semicenk", "Hadise", "Kenan Doğulu",
  "Athena", "Pinhani", "Adamlar", "Büyük Ev Ablukada", "Daft Punk", "Coldplay", "Arctic Monkeys",
  "Billie Eilish", "Rihanna", "Drake", "Bad Bunny", "Shakira", "Norah Jones", "Amy Winehouse",
  "Frank Sinatra", "Bob Marley", "Ibrahim Tatlıses", "Ferdi Tayfur", "Zeki Müren", "Barış Manço",
  "Cem Karaca", "Sıla", "Gülşen", "Murat Boz",
];

const slugs = Array.from({ length: VENUES }, (_, i) => `harita-yuk-${i + 1}`);

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function cleanup() {
  const venues = await must(db.from("venues").select("id").in("slug", slugs), "mekanlar");
  const ids = (venues as { id: string }[]).map((v) => v.id);
  if (ids.length) await must(db.from("venues").delete().in("id", ids), "mekan silme"); // kuyruk/now_playing cascade
  await must(db.from("songs").delete().like("youtube_video_id", "maptest-%"), "şarkı silme");
  console.log(`temizlendi: ${ids.length} mekan + test şarkıları`);
}

async function setup() {
  await cleanup();

  // Şarkılar: sanatçı başına 6
  const songRows = ARTISTS.flatMap((artist, a) =>
    Array.from({ length: 6 }, (_, k) => ({
      title: `${artist} — test şarkısı ${k + 1}`,
      artist,
      youtube_video_id: `maptest-${a}-${k}`,
      duration_ms: 200_000,
      album_cover_url: null,
    }))
  );
  const songs = (await must(db.from("songs").insert(songRows).select("id, artist"), "şarkılar")) as {
    id: string;
    artist: string;
  }[];

  const now = Date.now();
  for (let v = 0; v < VENUES; v++) {
    const [venue] = (await must(
      db
        .from("venues")
        .insert({
          slug: slugs[v],
          name: `Harita Yük ${v + 1}`,
          status: "active",
          latitude: 38.42 + v * 0.01,
          longitude: 27.13 + v * 0.01,
        })
        .select("id"),
      "mekan"
    )) as { id: string }[];

    // Zipf benzeri dağılım: her mekanın birkaç baskın şarkısı olsun
    const offset = v * 37;
    const pick = () => songs[(offset + Math.floor(songs.length * Math.random() ** 2.2)) % songs.length];
    const played = Array.from({ length: PLAYS_PER_VENUE }, (_, i) => ({
      venue_id: venue.id,
      song_id: pick().id,
      status: "played",
      added_at: new Date(now - (i + 1) * 60_000 * 30).toISOString(),
      played_at: new Date(now - i * 60_000 * 30).toISOString(),
    }));
    for (let i = 0; i < played.length; i += 500) {
      await must(db.from("queue").insert(played.slice(i, i + 500)), "çalma geçmişi");
    }
    await must(
      db.from("queue").insert(
        Array.from({ length: 12 }, (_, i) => ({
          venue_id: venue.id,
          song_id: pick().id,
          status: "queued",
          position: i + 1,
          priority: i === 0,
        }))
      ),
      "sıra"
    );
    await must(
      db.from("now_playing").upsert(
        {
          venue_id: venue.id,
          song_id: pick().id,
          is_playing: true,
          started_at: new Date().toISOString(),
          last_heartbeat_at: new Date(Date.now() + SECONDS * 1000 + 600_000).toISOString(),
        },
        { onConflict: "venue_id" }
      ),
      "çalan"
    );
  }

  if (!flag("warm")) {
    // Soğuk başlangıç: bu sanatçıların türü hiç bilinmiyor
    const { error } = await db.from("artist_genres").delete().neq("artist_key", "");
    if (error) throw new Error(`tür önbelleği: ${error.message}`);
  }
  console.log(
    `kuruldu: ${VENUES} mekan, ${songs.length} şarkı, ${VENUES * PLAYS_PER_VENUE} çalma, tür önbelleği ${flag("warm") ? "korundu" : "boşaltıldı"}`
  );
}

type Sample = { kind: "page" | "card"; ms: number; status: number; phase: "herd" | "flow" };
const samples: Sample[] = [];

async function hit(kind: Sample["kind"], path: string, phase: Sample["phase"]) {
  const t = performance.now();
  let status = 0;
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(30_000) });
    await res.arrayBuffer();
    status = res.status;
  } catch {
    status = -1;
  }
  samples.push({ kind, ms: performance.now() - t, status, phase });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function user(i: number, until: number) {
  const home = slugs[i % VENUES];
  // Sürü: herkes aynı anda sayfayı açıp aynı mekana dokunur
  await hit("page", `/venue/${home}/map`, "herd");
  await hit("card", `/api/venue-map/${slugs[0]}`, "herd");
  while (Date.now() < until) {
    await sleep(2000 + Math.random() * 4000);
    if (Math.random() < 0.15) await hit("page", `/venue/${home}/map`, "flow");
    await hit("card", `/api/venue-map/${slugs[Math.floor(Math.random() * VENUES)]}`, "flow");
  }
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function report(label: string, rows: Sample[]) {
  if (!rows.length) return;
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const bad = rows.filter((r) => r.status !== 200);
  const codes = [...new Set(bad.map((r) => r.status))].join(",");
  console.log(
    `${label.padEnd(16)} n=${String(rows.length).padStart(5)}  p50=${pct(ms, 50).toFixed(0).padStart(5)}ms  p95=${pct(ms, 95)
      .toFixed(0)
      .padStart(5)}ms  p99=${pct(ms, 99).toFixed(0).padStart(5)}ms  max=${ms[ms.length - 1].toFixed(0).padStart(5)}ms  hata=${bad.length}${
      codes ? ` (${codes})` : ""
    }`
  );
}

async function main() {
  if (flag("cleanup")) return cleanup();
  await setup();

  // Sunucu ayakta mı — test mekanına DEĞİL: kartı önceden hesaplatıp sürüyü ısıtmasın
  const probe = await fetch(`${BASE}/api/venue-map/yoklama-yok`).catch(() => null);
  if (!probe) {
    console.error(`${BASE} yanıt vermiyor`);
    process.exit(1);
  }

  console.log(`\n${USERS} kişi, ${SECONDS} sn → ${BASE}\n`);
  const started = Date.now();
  const until = started + SECONDS * 1000;
  await Promise.all(Array.from({ length: USERS }, (_, i) => user(i, until)));
  const elapsed = (Date.now() - started) / 1000;

  report("sürü · sayfa", samples.filter((s) => s.phase === "herd" && s.kind === "page"));
  report("sürü · kart", samples.filter((s) => s.phase === "herd" && s.kind === "card"));
  report("akış · sayfa", samples.filter((s) => s.phase === "flow" && s.kind === "page"));
  report("akış · kart", samples.filter((s) => s.phase === "flow" && s.kind === "card"));
  console.log(`\ntoplam ${samples.length} istek, ${(samples.length / elapsed).toFixed(1)} istek/sn`);

  await sleep(5000); // arka plandaki tür aramaları bitsin
  const { data: genres } = await db.from("artist_genres").select("genre");
  const rows = (genres ?? []) as { genre: string | null }[];
  console.log(
    `tür önbelleği: ${rows.length}/${ARTISTS.length} sanatçı kayıtlı, ${rows.filter((r) => r.genre).length} türü bulundu`
  );
  console.log("\nVeriyi silmek için: npm run load:map -- --cleanup");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
