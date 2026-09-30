#!/usr/bin/env node
/**
 * Sanatçı ADINDAN YouTube kanal kimliği bulur ve tohum listesine ekler.
 *
 *   npm run find:channels -- --dry            # ne yapacağını yazar
 *   npm run find:channels -- --budget 1500    # kotanın bir kısmını harca
 *   npm run find:channels -- --limit 300      # ilk 300 sanatçı
 *   npm run find:channels -- --from-requests  # çözülmemiş müşteri talepleri
 *   npm run find:channels -- --names-file x   # satır başına bir sanatçı adı
 *
 * NEDEN VAR
 * Hasat (seed-catalog.ts) bir sanatçının diskografisini ancak kanal kimliğini
 * bilirse çekebiliyor. Kimlik havuzdan gelir: şarkı hangi kanaldan geldiyse o.
 * Ama Türk plak şirketi kanallarından gelen 18.448 sanatçının kendi kanalı hiç
 * görünmüyor — şarkı "netd müzik" kanalından geldi, sanatçının kanalından değil.
 * Bu yüzden en çok dinlenen Türk sanatçılarının diskografisi eksik kalıyor.
 *
 * KOTA
 * channels.list?forHandle = 1 birim. search.list olsaydı 100 birim olurdu:
 * 1000 sanatçı için 100.000 birim, yani 10 günlük kotanın tamamı. Handle
 * tahmini isabet etmezse o sanatçı atlanır — search.list'e HİÇ düşülmez.
 *
 * Bulunan kanal, yükleme listesi (UC->UU) olarak scripts/seed-playlists.txt'e
 * yazılır; şarkıları çekmek seed-catalog.ts --harvest'in işi.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = "https://www.googleapis.com/youtube/v3";
const LIST_FILE = join(ROOT, "scripts/seed-playlists.txt");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BUDGET = Number(flag("budget", "1500"));
const FROM_REQUESTS = args.includes("--from-requests");
const NAMES_FILE = flag("names-file", "");
const LIMIT = Number(flag("limit", "1000"));

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const API_KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Eksik ortam değişkeni: YOUTUBE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ---------- ad normalleştirme ---------- */

// Türkçe harfleri ASCII'ye indirir: handle'lar ASCII olmak zorunda.
// "İ" özel — küçültülünce nokta bırakıyor, önce o ayıklanır.
const FOLD: Record<string, string> = {
  ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g",
  ç: "c", Ç: "c", ö: "o", Ö: "o", ü: "u", Ü: "u", â: "a", î: "i", û: "u",
};
function fold(text: string): string {
  return text
    .replace(/[ıİşŞğĞçÇöÖüÜâîû]/g, (c) => FOLD[c] ?? c)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
const slug = (text: string) => fold(text).replace(/[^a-z0-9]/g, "");

// Birden fazla sanatçının birlikte olduğu satırın kanalı yoktur; boşuna birim.
const COLLAB = /\s(&|feat\.?|ft\.?|vs\.?|x)\s|,/i;

// Handle tahminleri — sırayla denenir, ilk tutan kazanır. Sanatçı başına en
// fazla 2 birim: fazlası 1000 sanatçıda bütçeyi katlıyor.
function candidates(name: string): string[] {
  const base = slug(name);
  if (base.length < 3) return [];
  return [base, `${base}official`];
}

/* ---------- kota ---------- */

let unitsSpent = 0;
class BudgetExhausted extends Error {}

type Channel = { id: string; title: string; videoCount: number };

async function byHandle(handle: string): Promise<Channel | null> {
  if (unitsSpent + 1 > BUDGET) throw new BudgetExhausted();
  unitsSpent += 1;
  const query = new URLSearchParams({
    part: "snippet,statistics", forHandle: handle, key: API_KEY!,
  });
  const res = await fetch(`${API_BASE}/channels?${query}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403 && body.includes("quota")) throw new BudgetExhausted();
    if (res.status === 404 || res.status === 400) return null; // handle yok
    throw new Error(`channels.list hatası (${res.status}): ${body.slice(0, 160)}`);
  }
  const data = (await res.json()) as {
    items?: Array<{ id: string; snippet?: { title?: string }; statistics?: { videoCount?: string } }>;
  };
  const item = data.items?.[0];
  if (!item) return null;
  return {
    id: item.id,
    title: item.snippet?.title ?? "",
    videoCount: Number(item.statistics?.videoCount ?? 0),
  };
}

// Handle tahmini yanlış kanala düşebilir ("@simge" bambaşka biri olabilir).
// Kanal adı sanatçı adıyla örtüşmüyorsa kabul edilmez.
function isMatch(artist: string, channel: Channel): boolean {
  const a = slug(artist);
  const c = slug(channel.title);
  if (!a || !c) return false;
  return c === a || c === `${a}official` || c.startsWith(a) || a.startsWith(c);
}

/* ---------- ana akış ---------- */

// Havuzda HİÇ olmayan sanatçı, havuzdan çıkarılan hedef listesine giremez —
// tam da aranıp bulunamayanlar onlar. Bu yüzden iki dış kaynak var: elle isim
// listesi ve müşterinin karşılıksız kalmış serbest metin önerileri.
async function fromRequests(): Promise<string[]> {
  const { data, error } = await supabase
    .from("song_requests")
    .select("suggested_artist")
    .is("song_id", null)
    .not("suggested_artist", "is", null);
  if (error) throw new Error(`song_requests okunamadı: ${error.message}`);
  const names = new Set<string>();
  for (const row of data ?? []) {
    const name = (row.suggested_artist as string | null)?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

async function targets(): Promise<string[]> {
  if (NAMES_FILE) {
    return readFileSync(NAMES_FILE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, LIMIT);
  }
  if (FROM_REQUESTS) return (await fromRequests()).slice(0, LIMIT);
  const { data, error } = await supabase.rpc("tr_artists_without_channel", { limit_count: LIMIT });
  if (!error && Array.isArray(data)) return data as string[];
  // RPC yoksa dosyadan: psql ile çıkarılmış "ad|izlenme" listesi
  const csv = join(ROOT, "scripts/.tr-artists.csv");
  if (!existsSync(csv)) throw new Error(`Hedef listesi yok: ${csv} (veya RPC) — ${error?.message ?? ""}`);
  return readFileSync(csv, "utf8")
    .split("\n")
    .map((l) => l.split("|")[0].trim())
    .filter(Boolean)
    .slice(0, LIMIT);
}

async function main() {
  const known = existsSync(LIST_FILE) ? readFileSync(LIST_FILE, "utf8") : "";
  const names = await targets();
  const found: Array<{ artist: string; channel: Channel }> = [];
  const stats = { denenen: 0, atlanan: 0, bulunan: 0, adUyusmaz: 0, zatenVar: 0 };

  console.log(`${names.length} sanatçı · bütçe ${BUDGET} birim${DRY_RUN ? " (KURU ÇALIŞMA)" : ""}\n`);

  try {
  for (const name of names) {
    if (COLLAB.test(name)) { stats.atlanan++; continue; }
    const tries = candidates(name);
    if (tries.length === 0) { stats.atlanan++; continue; }

    stats.denenen++;
    let hit: Channel | null = null;
    for (const handle of tries) {
      const channel = await byHandle(handle);
      if (!channel) continue;
      if (!isMatch(name, channel)) { stats.adUyusmaz++; continue; }
      if (channel.videoCount === 0) continue;
      hit = channel;
      break;
    }
    if (!hit) continue;

    const uploads = `UU${hit.id.slice(2)}`;
    if (known.includes(uploads) || found.some((f) => f.channel.id === hit!.id)) {
      stats.zatenVar++;
      continue;
    }
    stats.bulunan++;
    found.push({ artist: name, channel: hit });
    console.log(`  ${name} -> ${hit.title} (${hit.videoCount} video, ${unitsSpent} birim)`);
  }
  } catch (err) {
    // Bütçe dolunca o ana kadar bulunanlar yazılmalı, yoksa harcanan birim çöp
    if (!(err instanceof BudgetExhausted)) throw err;
    console.log(`\n  bütçe doldu (${BUDGET} birim) — bulunanlar yazılıyor`);
  }
  return { found, stats };
}

function write(found: Array<{ artist: string; channel: Channel }>) {
  if (found.length === 0 || DRY_RUN) return;
  const lines = [
    "",
    `# İsimden bulunan sanatçı kanalları (channels.list?forHandle) — ${new Date().toISOString().slice(0, 10)}`,
    "# Türk plak şirketi kanallarından gelen, kendi kanalı havuzda görünmeyen",
    "# sanatçılar. Şarkıları seed-catalog.ts --harvest çeker.",
  ];
  for (const { artist, channel } of found) {
    lines.push(`UU${channel.id.slice(2)}  # ${channel.title} — ${artist} (${channel.videoCount} video)`);
  }
  appendFileSync(LIST_FILE, `${lines.join("\n")}\n`, "utf8");
}

main()
  .then(({ found, stats }) => {
    write(found);
    report(stats, found.length);
  })
  .catch((err) => {
    if (err instanceof BudgetExhausted) {
      console.log(`\nBütçe doldu (${BUDGET} birim)`);
      process.exit(0);
    }
    console.error(`\nHata: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });

function report(stats: Record<string, number>, yazilan: number) {
  console.log("\nBitti");
  console.log(`  denenen sanatçı : ${stats.denenen}`);
  console.log(`  atlanan (ortak/kısa ad): ${stats.atlanan}`);
  console.log(`  ad uyuşmadı     : ${stats.adUyusmaz}`);
  console.log(`  listede vardı   : ${stats.zatenVar}`);
  console.log(`  BULUNAN kanal   : ${stats.bulunan}${DRY_RUN ? " (yazılmadı)" : ""}`);
  console.log(`  kota harcanan   : ${unitsSpent} birim`);
}
