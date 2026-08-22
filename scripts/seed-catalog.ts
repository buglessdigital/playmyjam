#!/usr/bin/env node
/**
 * Ortak şarkı havuzunu (public.songs) YouTube playlist'lerinden tohumlar.
 *
 *   npm run seed:catalog -- --dry              # ne yapacağını yazar, hiçbir yere gitmez
 *   npm run seed:catalog                       # scripts/seed-playlists.txt'i işler
 *   npm run seed:catalog -- --budget 4000      # kotanın yalnızca bir kısmını harca
 *   npm run seed:catalog -- --playlist <url>   # tek liste
 *
 * NEDEN VAR
 * Müşteri katalogda olmayan bir şarkı istediğinde sistemin "şu yazı = şu YouTube
 * videosu" eşleşmesini bilmesi gerekiyor. Bu eşleşme yoksa mekan admininin elle
 * bağlantı yapıştırması gerekir. songs tablosu TÜM mekanlar için ortak olduğundan
 * havuzu bir kez önden doldurmak o elle işi neredeyse tümüyle ortadan kaldırıyor.
 *
 * KOTA
 * Pahalı olan çağrı search.list (100 birim) — bu betik onu HİÇ kullanmaz.
 *   playlistItems.list → 1 birim / 50 şarkı
 *   videos.list        → 1 birim / 50 şarkı
 * Yani ~50.000 şarkı ≈ 2.000 birim. Günlük varsayılan kota 10.000.
 * Havuzda zaten bulunan video kimlikleri için videos.list hiç çağrılmaz, bu yüzden
 * betiği tekrar tekrar çalıştırmak ucuzdur (yarıda kalırsa kaldığı yerden sürer).
 *
 * TEK SEFERLİK İŞ: bittiğinde üretimde çalışan hiçbir şey bu betiğe bağlı değildir.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { parseISODuration, parseVideoTitle, videoThumbnail } from "../lib/youtube-parse.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = "https://www.googleapis.com/youtube/v3";

/* ---------- argümanlar ---------- */

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");

function flag(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BUDGET = Number(flag("budget", "9000"));
const MAX_PER_PLAYLIST = Number(flag("max-per-playlist", "5000"));
const LIST_FILE = flag("file", join(ROOT, "scripts/seed-playlists.txt"));

/* ---------- ortam ---------- */

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvLocal();

const API_KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Eksik ortam değişkeni: YOUTUBE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ---------- kota sayacı ---------- */

let unitsSpent = 0;

class BudgetExhausted extends Error {}
class QuotaExhausted extends Error {}

function spend(units: number) {
  if (unitsSpent + units > BUDGET) throw new BudgetExhausted();
  unitsSpent += units;
}

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, key: API_KEY! });
  const res = await fetch(`${API_BASE}/${path}?${query}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403 && body.includes("quota")) throw new QuotaExhausted();
    throw new Error(`YouTube ${path} hatası (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/* ---------- kaynak listesi ---------- */

// Playlist URL'sinden ("...list=PL..." veya çıplak kimlik) playlist id çıkarır
function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/[?&]list=([A-Za-z0-9_-]{10,60})/);
  if (fromUrl) return fromUrl[1];
  if (/^[A-Za-z0-9_-]{10,60}$/.test(trimmed)) return trimmed;
  return null;
}

function readPlaylistIds(): string[] {
  const inline = args.flatMap((a, i) => (args[i - 1] === "--playlist" ? [a] : []));

  const fromFile = existsSync(LIST_FILE)
    ? readFileSync(LIST_FILE, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : [];

  const ids = [...inline, ...fromFile]
    .map(parsePlaylistId)
    .filter((id): id is string => !!id);

  return [...new Set(ids)];
}

/* ---------- şarkı süzgeci ---------- */

// Tohumlamada havuza HİÇ girmemesi gereken içerik. Buradaki ölçüt "şarkı değil":
// canlı/remix gibi meşru sürümler elenmez, onlar seçim aşamasında geriye itilir
// (bkz. lib/song-match.ts). Amaç havuzu çöple doldurmamak.
const NOT_A_SONG =
  /\b(karaoke|instrumental|enstrumantal|playback|reaction|tepki|tutorial|nasil\s+calinir|full\s+album|tam\s+albüm|megamix|nonstop|dj\s*set|mix\s*20\d\d|greatest\s+hits|top\s+\d+|playlist|derleme|saatlik|1\s*hour|10\s*hours|asmr|sleep|lofi\s+radio)\b/i;

const MIN_MS = 45_000;
const MAX_MS = 12 * 60_000;

type VideoItem = {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    categoryId?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean };
};

type SongRow = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
  channel_title: string;
  view_count: number;
};

const stats = {
  playlists: 0,
  seenIds: 0,
  alreadyKnown: 0,
  filtered: 0,
  upserted: 0,
};

function toRow(v: VideoItem): SongRow | null {
  if (v.snippet?.categoryId && v.snippet.categoryId !== "10") return null; // Müzik dışı
  if (v.status?.embeddable === false) return null; // gömülü player'da çalmaz
  const duration = parseISODuration(v.contentDetails?.duration ?? "");
  if (duration < MIN_MS || duration > MAX_MS) return null;

  const rawTitle = v.snippet?.title ?? "";
  if (!rawTitle || NOT_A_SONG.test(rawTitle)) return null;

  const { title, artist } = parseVideoTitle(rawTitle, v.snippet?.channelTitle ?? "");
  if (!title || !artist) return null;

  return {
    youtube_video_id: v.id,
    title,
    artist,
    album_cover_url:
      v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? videoThumbnail(v.id),
    duration_ms: duration,
    channel_title: v.snippet?.channelTitle ?? "",
    view_count: Number(v.statistics?.viewCount ?? 0),
  };
}

/* ---------- adımlar ---------- */

// playlistItems.list — 1 birim/sayfa (50 şarkı)
async function playlistVideoIds(playlistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    spend(1);
    const data = await api<{
      nextPageToken?: string;
      items?: Array<{ contentDetails?: { videoId?: string } }>;
    }>("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < MAX_PER_PLAYLIST);

  return [...new Set(ids)];
}

// Havuzda zaten olanları ayıkla — asıl tasarruf burada (videos.list hiç çağrılmaz)
async function filterKnown(videoIds: string[]): Promise<string[]> {
  const unknown: string[] = [];
  for (let i = 0; i < videoIds.length; i += 200) {
    const chunk = videoIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("songs")
      .select("youtube_video_id")
      .in("youtube_video_id", chunk);
    if (error) throw new Error(`songs okunamadı: ${error.message}`);
    const known = new Set((data ?? []).map((r) => r.youtube_video_id as string));
    for (const id of chunk) if (!known.has(id)) unknown.push(id);
  }
  return unknown;
}

// videos.list — 1 birim/50 video
async function fetchRows(videoIds: string[]): Promise<SongRow[]> {
  const rows: SongRow[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    spend(1);
    const data = await api<{ items?: VideoItem[] }>("videos", {
      part: "snippet,contentDetails,statistics,status",
      id: batch.join(","),
    });
    for (const v of data.items ?? []) {
      const row = toRow(v);
      if (row) rows.push(row);
      else stats.filtered++;
    }
  }
  return rows;
}

async function upsert(rows: SongRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("songs")
      .upsert(chunk, { onConflict: "youtube_video_id", ignoreDuplicates: true });
    if (error) throw new Error(`songs yazılamadı: ${error.message}`);
    stats.upserted += chunk.length;
  }
}

/* ---------- ana akış ---------- */

async function main() {
  const playlistIds = readPlaylistIds();
  if (playlistIds.length === 0) {
    console.error(
      `Kaynak liste boş. ${LIST_FILE} dosyasına playlist bağlantısı ekleyin ya da --playlist <url> verin.`
    );
    process.exit(1);
  }

  console.log(
    `${playlistIds.length} playlist, kota bütçesi ${BUDGET} birim${DRY_RUN ? " (KURU ÇALIŞMA)" : ""}\n`
  );

  for (const playlistId of playlistIds) {
    const ids = await playlistVideoIds(playlistId);
    stats.playlists++;
    stats.seenIds += ids.length;

    const unknown = await filterKnown(ids);
    stats.alreadyKnown += ids.length - unknown.length;

    if (unknown.length === 0) {
      console.log(`  ${playlistId}: ${ids.length} şarkı, hepsi havuzda zaten`);
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `  ${playlistId}: ${ids.length} şarkı, ${unknown.length} yeni → ~${Math.ceil(unknown.length / 50)} birim daha`
      );
      continue;
    }

    const rows = await fetchRows(unknown);
    await upsert(rows);
    console.log(
      `  ${playlistId}: ${ids.length} şarkı → ${rows.length} yeni kayıt (${unitsSpent} birim harcandı)`
    );
  }
}

main()
  .then(() => report("Bitti"))
  .catch((err) => {
    if (err instanceof BudgetExhausted) return report(`Bütçe doldu (${BUDGET} birim)`);
    if (err instanceof QuotaExhausted) return report("Günlük YouTube kotası doldu");
    console.error(`\nHata: ${err instanceof Error ? err.message : err}`);
    report("Yarıda kesildi");
    process.exit(1);
  });

// Yarıda kesilse bile aynı komut kaldığı yerden sürer: işlenmiş video kimlikleri
// havuzda olduğu için ikinci çalıştırmada videos.list'e hiç gitmez.
function report(headline: string) {
  console.log(`\n${headline}`);
  console.log(`  playlist       : ${stats.playlists}`);
  console.log(`  görülen şarkı  : ${stats.seenIds}`);
  console.log(`  havuzda vardı  : ${stats.alreadyKnown}`);
  console.log(`  süzgeçte elendi: ${stats.filtered}`);
  console.log(`  havuza eklendi : ${stats.upserted}`);
  console.log(`  kota harcanan  : ${unitsSpent} birim`);
}
