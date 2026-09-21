import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlaylistItemCounts, YouTubeQuotaError } from "@/lib/youtube";
import { CATALOG_VIDEO_PARTS, toCatalogRow, type CatalogVideoItem } from "@/lib/catalog-row";

// Günlük "yeni çıkanlar" turu. Hasat betiği (scripts/seed-catalog.ts) havuzu bir
// kez doldurdu ama elle çalışıyor; yeni çıkan şarkı havuza kendiliğinden girmiyordu.
//
// Kaynak: havuzdaki "Sanatçı - Topic" kanallarının yükleme listeleri. Topic
// kanalına dağıtımcı yeni şarkıyı çıkış günü düşer.
//   1) Ön kontrol: playlists.list, 50 liste = 1 birim. Sayı değişmemişse liste açılmaz.
//   2) Değişen liste en yeniden başlanarak sayfa sayfa okunur (yükleme listeleri
//      yeniden eskiye sıralı). Havuzda olan bir şarkıya rastlanan sayfada durulur:
//      oradan eskisi zaten okunmuş. Tipik yeni çıkan = 1 sayfa + 1 videos.list = 2 birim.
//   3) İlk kez görülen liste (catalog_sources'ta yok) sonuna kadar okunur: havuzda
//      tesadüfen tek bir şarkısı olan, hiç hasat edilmemiş bir liste erken durmasın.
//
// Kota: cron kotanın sıfırlanmasından (00:00 PT = 07:00 UTC) hemen önce koşar,
// yani gecenin ARTAN kotasını kullanır; mekanların gece ihtiyacına dokunmaz.

const BUDGET = 3000;
const CONCURRENCY = 6;
// Vercel fonksiyon süresi 300 sn; yarıda kalan liste yarın baştan okunur
const TIME_BUDGET_MS = 240_000;
// Tek liste bir turda kotayı yutmasın (5.000 şarkı)
const MAX_PAGES = 100;

const API_BASE = "https://www.googleapis.com/youtube/v3";

type Result = {
  sources: number;
  changed: number;
  processed: number;
  added: number;
  units: number;
  stopped: "done" | "budget" | "time" | "quota";
};

class OutOfBudget extends Error {}

async function youtube<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY! });
  const res = await fetch(`${API_BASE}/${path}?${query}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403 && body.includes("quota")) throw new YouTubeQuotaError();
    throw new Error(`YouTube ${path} hatası (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// PostgREST tek istekte en fazla 1.000 satır döndürüyor — okumalar sayfalı
async function readState(): Promise<Map<string, number>> {
  const state = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("catalog_sources")
      .select("playlist_id, item_count")
      .order("playlist_id")
      .range(from, from + 999);
    if (error) throw new Error(`catalog_sources okunamadı: ${error.message}`);
    for (const row of data ?? []) state.set(row.playlist_id as string, row.item_count as number);
    if (!data || data.length < 1000) return state;
  }
}

// Havuzdaki Topic kanallarının yükleme listeleri (bkz. 0053)
async function readSources(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("catalog_topic_uploads");
  if (error) throw new Error(`kaynaklar okunamadı: ${error.message}`);
  return (data ?? []) as string[];
}

async function knownIds(videoIds: string[]): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("youtube_video_id")
    .in("youtube_video_id", videoIds);
  if (error) throw new Error(`songs okunamadı: ${error.message}`);
  return new Set((data ?? []).map((r) => r.youtube_video_id as string));
}

export async function refreshCatalogNewReleases(): Promise<Result> {
  const startedAt = Date.now();
  let units = 0;
  let stopped: Result["stopped"] = "done";

  const spend = (n: number) => {
    if (units + n > BUDGET) throw new OutOfBudget();
    if (Date.now() - startedAt > TIME_BUDGET_MS) throw new OutOfBudget("time");
    units += n;
  };

  const sources = await readSources();
  const state = await readState();
  const result: Result = { sources: sources.length, changed: 0, processed: 0, added: 0, units: 0, stopped };

  let counts: Map<string, number>;
  try {
    const checked = await getPlaylistItemCounts(sources);
    counts = checked.counts;
    units += checked.units;
  } catch (err) {
    if (err instanceof YouTubeQuotaError) return { ...result, stopped: "quota" };
    throw err;
  }

  // Önce daha önce görülmüş ve büyümüş listeler (asıl yeni çıkanlar), sonra
  // ilk kez görülenler küçükten büyüğe — bütçe yetmezse ucuzlar bitmiş olsun
  const changed = sources
    .filter((id) => counts.has(id) && state.get(id) !== counts.get(id))
    .sort((a, b) => {
      const seenA = state.has(a) ? 0 : 1;
      const seenB = state.has(b) ? 0 : 1;
      return seenA - seenB || counts.get(a)! - counts.get(b)!;
    });
  result.changed = changed.length;

  async function processList(playlistId: string) {
    const seenBefore = state.has(playlistId);
    const unknown = new Set<string>();
    let pageToken: string | undefined;
    let pages = 0;

    do {
      spend(1);
      const data = await youtube<{
        nextPageToken?: string;
        items?: Array<{ contentDetails?: { videoId?: string } }>;
      }>("playlistItems", {
        part: "contentDetails",
        playlistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });
      pages++;
      const ids = (data.items ?? [])
        .map((i) => i.contentDetails?.videoId)
        .filter((id): id is string => !!id);
      const known = await knownIds(ids);
      for (const id of ids) if (!known.has(id)) unknown.add(id);
      if (seenBefore && known.size > 0) break;
      pageToken = data.nextPageToken;
    } while (pageToken && pages < MAX_PAGES);

    const ids = [...unknown];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      spend(1);
      const data = await youtube<{ items?: CatalogVideoItem[] }>("videos", {
        part: CATALOG_VIDEO_PARTS,
        id: batch.join(","),
      });
      const rows = (data.items ?? []).map(toCatalogRow).filter((r) => r !== null);
      if (rows.length === 0) continue;
      const { error } = await supabaseAdmin
        .from("songs")
        .upsert(rows, { onConflict: "youtube_video_id", ignoreDuplicates: true });
      if (error) throw new Error(`songs yazılamadı: ${error.message}`);
      result.added += rows.length;
    }

    // Liste sonuna kadar (ya da bilinen şarkıya kadar) işlendi: bu sayı görüldü
    await supabaseAdmin
      .from("catalog_sources")
      .upsert({ playlist_id: playlistId, item_count: counts.get(playlistId)!, checked_at: new Date().toISOString() });
    result.processed++;
  }

  let next = 0;
  async function worker() {
    while (next < changed.length && stopped === "done") {
      const playlistId = changed[next++];
      try {
        await processList(playlistId);
      } catch (err) {
        if (err instanceof OutOfBudget) {
          stopped = err.message === "time" ? "time" : "budget";
        } else if (err instanceof YouTubeQuotaError) {
          stopped = "quota";
        } else {
          // Silinmiş/gizlenmiş tek liste turu düşürmesin
          console.error(`catalog-new ${playlistId}:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return { ...result, units, stopped };
}
