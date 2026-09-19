#!/usr/bin/env node
/**
 * Ortak şarkı havuzunu (public.songs) YouTube playlist'lerinden tohumlar.
 *
 *   npm run seed:catalog -- --dry              # ne yapacağını yazar, hiçbir yere gitmez
 *   npm run seed:catalog                       # scripts/seed-playlists.txt'i işler
 *   npm run seed:catalog -- --budget 4000      # kotanın yalnızca bir kısmını harca
 *   npm run seed:catalog -- --playlist <url>   # tek liste
 *   npm run seed:catalog -- --force            # bilinen listeleri de yeniden tara
 *   npm run seed:catalog -- --harvest          # havuzdaki kanalları kaynağa çevir
 *   npm run seed:catalog -- --harvest-any      # sadece Topic değil, HER kanal
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
 * Dosyaya liste eklendikçe her tur ESKİ listeleri de baştan okuyordu: 34 listede
 * tek tur 144 birime çıktı. Artık her listenin şarkı sayısı scripts/.seed-state.json
 * dosyasında tutuluyor ve tur başında TEK playlists.list çağrısıyla (50 liste =
 * 1 birim) karşılaştırılıyor — sayı değişmemiş liste hiç açılmıyor.
 *
 * HASAT (--harvest)
 * Elle playlist bağlantısı toplamak havuzu büyütmenin en yavaş yolu. Oysa
 * videos.list yanıtı zaten snippet.channelId'yi döndürüyor ve bir kanalın
 * yüklemeler listesi saf string dönüşümüyle bulunuyor: UCxxx -> UUxxx, sıfır
 * kota. "Sanatçı - Topic" kanallarında bu liste sanatçının TÜM resmi
 * diskografisi demek (ölçüldü: The Weeknd - Topic = 967 şarkı, ~20 birim).
 *
 * Hasat iki adım: (1) channel_id'si boş satırlar için videos.list ile geri
 * doldurma, (2) havuzdaki kanalların yükleme listelerini kaynak listesine ekleme.
 * Tur kendi kendini besler — yeni şarkı yeni kanal getirir. Varsayılan olarak
 * yalnızca Topic kanalları alınır; --harvest-any her kanalı alır ama derleme
 * kanallarının mix/set yüklemeleri süzgece yüklenir.
 *
 * TEK SEFERLİK İŞ: bittiğinde üretimde çalışan hiçbir şey bu betiğe bağlı değildir.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { parseISODuration, parseVideoTitle, videoThumbnail } from "../lib/youtube-parse.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = "https://www.googleapis.com/youtube/v3";

/* ---------- argümanlar ---------- */

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
const FORCE = args.includes("--force");
const HARVEST_ANY = args.includes("--harvest-any");
const HARVEST = HARVEST_ANY || args.includes("--harvest");

function flag(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BUDGET = Number(flag("budget", "9000"));
const MAX_PER_PLAYLIST = Number(flag("max-per-playlist", "5000"));
const LIST_FILE = flag("file", join(ROOT, "scripts/seed-playlists.txt"));
const STATE_FILE = join(ROOT, "scripts/.seed-state.json");

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

// Tekrarlanmasının anlamı olmayan hata: silinmiş/gizlenmiş liste, hatalı istek.
// retry() bunu olduğu gibi yukarı verir, çağıran tek listeyi düşürür.
class NotRetryable extends Error {}

function spend(units: number) {
  if (unitsSpent + units > BUDGET) throw new BudgetExhausted();
  unitsSpent += units;
}

// Geri doldurma binlerce HTTP turu sürüyor; tek bir geçici ağ takılması ("fetch
// failed") bütün turu düşürüyordu. Kota/yetki hataları YENİDEN DENENMEZ, onlar
// tekrar edince de aynı sonucu verir; yalnızca ağ hatası ve 5xx tekrarlanır.
// fn her denemede YENİDEN çağrılır: Supabase sorgu kurucuları tek atımlıktır,
// aynı kurucuyu ikinci kez await etmek istek tekrarlamaz.
async function retry<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof QuotaExhausted || err instanceof BudgetExhausted) throw err;
      if (err instanceof NotRetryable) throw err;
      lastError = err;
      const wait = 1000 * 3 ** attempt;
      console.log(`  ${label}: geçici hata, ${wait / 1000} sn sonra yeniden denenecek`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, key: API_KEY! });
  return retry(path, async () => {
    const res = await fetch(`${API_BASE}/${path}?${query}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 403 && body.includes("quota")) throw new QuotaExhausted();
      const message = `YouTube ${path} hatası (${res.status}): ${body.slice(0, 200)}`;
      // 5xx ve 429 geçici; kalan 4xx'ler (404 silinmiş liste, 400 hatalı kimlik)
      // ne kadar denenirse denensin aynı yanıtı verir.
      if (res.status < 500 && res.status !== 429) throw new NotRetryable(message);
      throw new Error(message);
    }
    return res.json() as Promise<T>;
  });
}

/* ---------- kaynak listesi ---------- */

// Bağlantıyı türüne göre ayırır.
//
// Kanal bağlantısı bir liste DEĞİLDİR: kanalın "yüklemeler" listesi (UC→UU)
// çoğu derleme kanalında boştur — içerik playlist'lerde durur. Bu yüzden kanal
// ayrı ele alınır ve tur başında kendi listelerine açılır (bkz. expandChannels).
//
// @kullaniciadi biçimindeki bağlantılar desteklenmez: kanal kimliğine çevirmek
// ayrı bir API çağrısı ister. Kanalın herhangi bir videosundan /channel/UC... alın.
type Source = { kind: "playlist" | "channel"; id: string };

function parseSource(input: string): Source | null {
  const trimmed = input.trim();

  const fromUrl = trimmed.match(/[?&]list=([A-Za-z0-9_-]{10,60})/);
  if (fromUrl) return { kind: "playlist", id: fromUrl[1] };

  const channelUrl = trimmed.match(/\/channel\/(UC[A-Za-z0-9_-]{20,30})/);
  if (channelUrl) return { kind: "channel", id: channelUrl[1] };

  if (/^UC[A-Za-z0-9_-]{20,30}$/.test(trimmed)) return { kind: "channel", id: trimmed };
  if (/^[A-Za-z0-9_-]{10,60}$/.test(trimmed)) return { kind: "playlist", id: trimmed };
  return null;
}

// playlists.list?channelId — 1 birim / 50 liste. Kanalın herkese açık bütün
// listeleri. Boş listeler atılır; şarkı sayıları ön kontrole doğrudan girer,
// böylece kanal listeleri için ikinci bir playlists.list çağrısı gerekmez.
async function expandChannels(
  channelIds: string[],
  counts: Map<string, number>
): Promise<string[]> {
  const found: string[] = [];

  for (const channelId of channelIds) {
    let pageToken: string | undefined;
    let fromThis = 0;
    do {
      spend(1);
      const data = await api<{
        nextPageToken?: string;
        items?: Array<{ id?: string; snippet?: { title?: string }; contentDetails?: { itemCount?: number } }>;
      }>("playlists", {
        part: "contentDetails",
        channelId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });
      for (const item of data.items ?? []) {
        const count = item.contentDetails?.itemCount ?? 0;
        if (!item.id || count === 0) continue;
        counts.set(item.id, count);
        found.push(item.id);
        fromThis++;
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    console.log(`  kanal ${channelId}: ${fromThis} liste bulundu`);
  }

  return found;
}

function readSources(): { playlists: string[]; channels: string[] } {
  const inline = args.flatMap((a, i) => (args[i - 1] === "--playlist" ? [a] : []));

  const fromFile = existsSync(LIST_FILE)
    ? readFileSync(LIST_FILE, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : [];

  const sources = [...inline, ...fromFile]
    .map(parseSource)
    .filter((s): s is Source => !!s);

  return {
    playlists: [...new Set(sources.filter((s) => s.kind === "playlist").map((s) => s.id))],
    channels: [...new Set(sources.filter((s) => s.kind === "channel").map((s) => s.id))],
  };
}

/* ---------- tamamlanmış listeler ---------- */

// playlistId → en son tohumlandığındaki şarkı sayısı.
// Sayı değişmediyse listede yeni şarkı yok demektir; açmaya değmez.
type SeedState = Record<string, number>;

function readState(): SeedState {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SeedState;
  } catch {
    return {}; // bozuk dosya: baştan kurulur, en fazla bir tur fazladan kota
  }
}

function writeState(state: SeedState) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

// playlists.list — 1 birim / 50 liste. Turun en ucuz adımı ve en büyük tasarrufu.
// Yanıtta dönmeyen kimlik silinmiş/gizlenmiş listedir; state'e bakılmadan denenir
// ve asıl hatayı playlistItems verir.
async function currentItemCounts(playlistIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < playlistIds.length; i += 50) {
    const batch = playlistIds.slice(i, i + 50);
    spend(1);
    const data = await api<{ items?: Array<{ id?: string; contentDetails?: { itemCount?: number } }> }>(
      "playlists",
      { part: "contentDetails", id: batch.join(","), maxResults: "50" }
    );
    for (const item of data.items ?? []) {
      if (item.id && typeof item.contentDetails?.itemCount === "number") {
        counts.set(item.id, item.contentDetails.itemCount);
      }
    }
  }
  return counts;
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
    channelId?: string;
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
  channel_id: string | null;
  view_count: number;
};

const stats = {
  playlists: 0,
  unchanged: 0,
  failed: [] as string[],
  seenIds: 0,
  alreadyKnown: 0,
  filtered: 0,
  upserted: 0,
  backfilled: 0,
  harvested: 0,
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
    channel_id: v.snippet?.channelId ?? null,
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
    const { data, error } = await retry("songs okuma", () =>
      supabase.from("songs").select("youtube_video_id").in("youtube_video_id", chunk)
    );
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

// ignoreDuplicates=false yalnızca geri doldurmada kullanılır: orada satır zaten
// havuzda, amaç eksik kolonu (channel_id) tamamlamak.
async function upsert(rows: SongRow[], ignoreDuplicates = true) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await retry("songs yazma", () =>
      supabase.from("songs").upsert(chunk, { onConflict: "youtube_video_id", ignoreDuplicates })
    );
    if (error) throw new Error(`songs yazılamadı: ${error.message}`);
    stats.upserted += chunk.length;
  }
}


/* ---------- hasat ---------- */

// channel_id'si bulunamayan satırın nişanı. Olmasa silinmiş/süzgece takılmış
// videolar her turda yeniden sorulur ve geri doldurma hiç bitmez.
const UNKNOWN_CHANNEL = "-";

// videos.list — 1 birim/50. Havuzdaki eski satırlar channel_id kolonundan önce
// yazıldığı için kanal kimlikleri boş; hasat edebilmek için bir kez doldurulur.
// Tur yarıda kesilse bile ilerleme kolonda durur, kaldığı yerden sürer.
async function backfillChannelIds() {
  for (;;) {
    const { data, error } = await retry("songs okuma", () =>
      supabase.from("songs").select("youtube_video_id").is("channel_id", null).limit(1000)
    );
    if (error) throw new Error(`songs okunamadı: ${error.message}`);

    const ids = (data ?? []).map((r) => r.youtube_video_id as string);
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const rows = await fetchRows(batch);
      if (rows.length > 0) await upsert(rows, false);
      stats.backfilled += rows.length;

      const filled = new Set(rows.map((r) => r.youtube_video_id));
      const missing = batch.filter((id) => !filled.has(id));
      if (missing.length > 0) {
        const { error: markError } = await retry("channel_id işaretleme", () =>
          supabase.from("songs").update({ channel_id: UNKNOWN_CHANNEL }).in("youtube_video_id", missing)
        );
        if (markError) throw new Error(`channel_id işaretlenemedi: ${markError.message}`);
      }
    }

    console.log(`  geri doldurma: ${stats.backfilled} kanal kimliği (${unitsSpent} birim)`);
  }
}

// Havuzdaki kanalları yükleme listelerine çevirir. UC -> UU dönüşümü string
// işlemi: kanal başına playlists.list çağrısı YOK, sıfır kota.
//
// Varsayılan yalnızca "Sanatçı - Topic" kanalları: bunların yüklemeleri resmi
// albüm sesleridir, kategori 10 ve gömülebilir. --harvest-any her kanalı alır;
// derleme kanallarının saatlik mix'leri süzgece yüklenir, kota boşa gider.
async function harvestUploadPlaylists(): Promise<string[]> {
  const channels = new Set<string>();
  const PAGE = 1000;

  // Anahtar sıralı sayfalama (id > son id). Sırasız .range() 227 bin satırda
  // sayfalar arasında satır atlıyordu: 1.471 kanalın 1.165'i bulunuyordu.
  // OFFSET'li sıralı sayfalama da olmaz — derin sayfalarda her istek baştan tarar.
  let lastId: string | null = null;
  for (;;) {
    const after = lastId;
    const { data, error } = await retry("kanal okuma", () => {
      let query = supabase
        .from("songs")
        .select("id, channel_id")
        .not("channel_id", "is", null)
        .neq("channel_id", UNKNOWN_CHANNEL)
        .order("id")
        .limit(PAGE);
      if (after) query = query.gt("id", after);
      return HARVEST_ANY ? query : query.ilike("channel_title", "%- Topic");
    });
    if (error) throw new Error(`songs okunamadı: ${error.message}`);
    for (const row of data ?? []) {
      const id = row.channel_id as string | null;
      if (id && id.startsWith("UC")) channels.add(id);
    }
    if (!data || data.length < PAGE) break;
    lastId = data[data.length - 1].id as string;
  }

  const uploads = [...channels].map((id) => `UU${id.slice(2)}`);
  stats.harvested = uploads.length;
  console.log(
    `  hasat: ${channels.size} kanal -> ${uploads.length} yükleme listesi` +
      (HARVEST_ANY ? " (her kanal)" : " (yalnızca Topic)")
  );
  return uploads;
}

/* ---------- ana akış ---------- */

async function main() {
  const { playlists, channels } = readSources();
  if (playlists.length === 0 && channels.length === 0 && !HARVEST) {
    console.error(
      `Kaynak liste boş. ${LIST_FILE} dosyasına playlist ya da kanal bağlantısı ekleyin veya --playlist <url> verin.`
    );
    process.exit(1);
  }

  const state = FORCE ? {} : readState();

  let harvested: string[] = [];
  if (HARVEST) {
    if (DRY_RUN) {
      const { count } = await supabase
        .from("songs")
        .select("youtube_video_id", { count: "exact", head: true })
        .is("channel_id", null);
      console.log(`  geri doldurulacak: ${count ?? 0} satır ≈ ${Math.ceil((count ?? 0) / 50)} birim`);
    } else {
      await backfillChannelIds();
    }
    harvested = await harvestUploadPlaylists();
  }

  // Kanal listelerinin şarkı sayıları expandChannels sırasında zaten dolduğu için
  // ön kontrol yalnızca doğrudan verilen playlist'ler ve hasat için çağrılır
  const counts = await currentItemCounts([...playlists, ...harvested]);
  const fromChannels = channels.length > 0 ? await expandChannels(channels, counts) : [];
  const playlistIds = [...new Set([...playlists, ...harvested, ...fromChannels])];

  const todo = playlistIds.filter((id) => {
    const seen = state[id];
    const now = counts.get(id);
    if (seen !== undefined && now !== undefined && seen === now) {
      stats.unchanged++;
      return false;
    }
    return true;
  });

  console.log(
    `${playlistIds.length} playlist` +
      (channels.length > 0 ? ` (${fromChannels.length}'i ${channels.length} kanaldan)` : "") +
      (harvested.length > 0 ? ` (${harvested.length}'i hasattan)` : "") +
      ` · ${stats.unchanged} değişmemiş, ${todo.length} taranacak · ` +
      `bütçe ${BUDGET} birim${DRY_RUN ? " (KURU ÇALIŞMA)" : ""}\n`
  );

  for (const playlistId of todo) {
    try {
      await seedPlaylist(playlistId, counts, state);
    } catch (err) {
      // Bütçe/kota dışındaki hatalar TEK listeyi düşürür, turu değil: silinmiş
      // ya da gizlenmiş bir bağlantı yüzünden 36 listenin taranmaması saçma olur
      if (err instanceof BudgetExhausted || err instanceof QuotaExhausted) throw err;
      stats.failed.push(playlistId);
      console.log(`  ${playlistId}: ATLANDI — ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }
  }
}

// Tek listenin tüm işi. Hatası çağırana gider, orada tek liste olarak yutulur.
async function seedPlaylist(playlistId: string, counts: Map<string, number>, state: SeedState) {
  const ids = await playlistVideoIds(playlistId);
  stats.playlists++;
  stats.seenIds += ids.length;

  const unknown = await filterKnown(ids);
  stats.alreadyKnown += ids.length - unknown.length;

  if (DRY_RUN) {
    console.log(
      `  ${playlistId}: ${ids.length} şarkı, ${unknown.length} yeni → ~${Math.ceil(unknown.length / 50)} birim daha`
    );
    return;
  }

  if (unknown.length > 0) {
    const rows = await fetchRows(unknown);
    await upsert(rows);
    console.log(
      `  ${playlistId}: ${ids.length} şarkı → ${rows.length} yeni kayıt (${unitsSpent} birim harcandı)`
    );
  } else {
    console.log(`  ${playlistId}: ${ids.length} şarkı, hepsi havuzda zaten`);
  }

  // Liste baştan sona işlendi: bir dahaki tura ön kontrolde elensin.
  // Her listeden sonra yazılır — tur yarıda kesilse bile ilerleme korunur.
  const count = counts.get(playlistId);
  if (count !== undefined) {
    state[playlistId] = count;
    writeState(state);
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
  if (stats.backfilled > 0) console.log(`  geri doldurulan: ${stats.backfilled} kanal kimliği`);
  if (stats.harvested > 0) console.log(`  hasat listesi  : ${stats.harvested}`);
  console.log(`  taranan liste  : ${stats.playlists}`);
  console.log(`  değişmemiş     : ${stats.unchanged}`);
  console.log(`  görülen şarkı  : ${stats.seenIds}`);
  console.log(`  havuzda vardı  : ${stats.alreadyKnown}`);
  console.log(`  süzgeçte elendi: ${stats.filtered}`);
  console.log(`  havuza eklendi : ${stats.upserted}`);
  console.log(`  kota harcanan  : ${unitsSpent} birim`);
  if (stats.failed.length > 0) {
    console.log(`  AÇILAMADI      : ${stats.failed.join(", ")}`);
    console.log("  (liste silinmiş/gizli olabilir — seed-playlists.txt'ten çıkarın)");
  }
}
