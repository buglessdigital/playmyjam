import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshVideoMetadata, YouTubeQuotaError, type VideoRefresh } from "@/lib/youtube";
import { purgeUnplayableSong } from "@/lib/playlist";

// YouTube Developer Policy III.E.4: 30 günden eski metadata tazelenmeli.
//
// Havuz hasatla ~760 bin satıra çıktı ve büyüyor. Eski tur "günde havuz/30,
// en çok 5000" diyordu ama PostgREST tek sorguda 1.000 satır döndürdüğü için
// gerçekte günde 1.000 satır tazeleniyordu (tam tur ~2 yıl). Üstelik 19-21 Eyl
// hasadıyla eklenen ~512 bin satırın 30 günü aynı üç güne denk geliyor.
//
// Şimdi: her gün en eskiden başlayarak havuzun 1/20'si. En eski önce gittiği
// için her satır en geç ~20 günde bir tazelenir; dalgalar da erken erir.
// Kota: 50 satır = 1 birim → 760 bin havuzda ~760 birim/gün.
const CYCLE_DAYS = 20;
const MIN_BATCH = 1_000;
// Kota tavanı: 75.000 satır = 1.500 birim (havuz ~1,5 milyonu geçerse döngü uzar)
const MAX_BATCH = 75_000;
// Yeni tazelenmiş satır yeniden sorulmasın
const MIN_AGE_DAYS = 7;
// Adaylar tek RPC ile dilim dilim alınır (0054 stale_song_video_ids); 20 bin
// aday ~2 sn, API rolünün sorgu sınırı 8 sn.
const CANDIDATE_SLICE = 20_000;
// Tek toplu yazmanın satır sayısı
const CHUNK = 1_000;
// Paralel işlenen parti sayısı. Sıralı gidince 1.000 satır ~5 sn sürüyordu
// (videos.list ~1,5, yazma ~2,7 sn); 4 paralel yazma + hasat aynı anda
// veritabanını sorgu sınırına dayadı, 3'te kalındı.
const PARALLEL_CHUNKS = 3;
// Parti içi videos.list paralelliği (her çağrı 50 video)
const YT_CONCURRENCY = 5;

export type MetadataRefreshResult = {
  pool: number;
  target: number;
  refreshed: number;
  delisted: number;
  purged: number;
  units: number;
  stopped: "done" | "time" | "quota";
  // Adım süreleri (ms) — 300 sn'ye sığıp sığmadığını izlemek için
  ms: { count: number; select: number; youtube: number; write: number; purge: number };
};

type Row = {
  youtube_video_id: string;
  title?: string;
  artist?: string;
  album_cover_url?: string;
  duration_ms?: number;
  channel_title?: string;
  view_count?: number;
  embeddable: boolean;
};

export async function refreshStaleMetadata(deadline: number): Promise<MetadataRefreshResult> {
  const ms = { count: 0, select: 0, youtube: 0, write: 0, purge: 0 };
  const timed = async <T>(key: keyof typeof ms, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      ms[key] += Date.now() - t;
    }
  };

  // Tahmini sayım yeter: yalnızca günlük parti boyunu belirliyor. Tam sayım
  // 780 bin satırda ~3 sn sürüyordu.
  const { count } = await timed("count", async () =>
    supabaseAdmin.from("songs").select("id", { count: "estimated", head: true })
  );
  const pool = count ?? 0;
  const target = Math.min(MAX_BATCH, Math.max(MIN_BATCH, Math.ceil(pool / CYCLE_DAYS)));
  const result: MetadataRefreshResult = {
    pool, target, refreshed: 0, delisted: 0, purged: 0, units: 0, stopped: "done", ms,
  };
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 86_400_000).toISOString();

  // Tek parti: videos.list → toplu yazma → gömülemeyenleri kataloglardan düşürme
  async function processChunk(ids: string[]) {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
    const meta = new Map<string, VideoRefresh | null>();
    await timed("youtube", async () => {
      for (let i = 0; i < batches.length; i += YT_CONCURRENCY) {
        const maps = await Promise.all(batches.slice(i, i + YT_CONCURRENCY).map((b) => refreshVideoMetadata(b)));
        result.units += maps.length;
        for (const m of maps) for (const [k, v] of m) meta.set(k, v);
      }
    });

    const rows: Row[] = ids.map((id) => {
      const m = meta.get(id);
      // Yanıtta dönmeyen video silinmiş/gizlenmiş: metadata artık doğrulanamaz,
      // gömülemez işaretlenir ki arama ve otomatik dolum önermesin
      if (!m) {
        result.delisted++;
        return { youtube_video_id: id, embeddable: false };
      }
      result.refreshed++;
      return { youtube_video_id: id, ...m };
    });

    const unplayable = await timed("write", async () => {
      const { data, error } = await supabaseAdmin.rpc("refresh_song_metadata", { p_rows: rows });
      if (error) throw new Error(`metadata yazılamadı: ${error.message}`);
      return (data ?? []) as { song_id: string }[];
    });

    // Hak sahibi embed'i kapatmış ya da video kalkmış: mekan kataloglarından düşür
    await timed("purge", async () => {
      for (const row of unplayable) {
        await purgeUnplayableSong(row.song_id);
        result.purged++;
      }
    });
  }

  while (result.refreshed + result.delisted < target) {
    const remaining = target - result.refreshed - result.delisted;
    const candidates = await timed("select", async () => {
      const { data, error } = await supabaseAdmin.rpc("stale_song_video_ids", {
        p_cutoff: cutoff,
        p_limit: Math.min(CANDIDATE_SLICE, remaining),
      });
      if (error) throw new Error(`adaylar okunamadı: ${error.message}`);
      return (data ?? []) as string[];
    });
    if (candidates.length === 0) break;

    const chunks: string[][] = [];
    for (let i = 0; i < candidates.length; i += CHUNK) chunks.push(candidates.slice(i, i + CHUNK));

    // Sabit sayıda işçi partileri sırayla çeker
    let next = 0;
    const worker = async () => {
      while (next < chunks.length && result.stopped === "done") {
        if (Date.now() > deadline) {
          result.stopped = "time";
          return;
        }
        const chunk = chunks[next++];
        try {
          await processChunk(chunk);
        } catch (err) {
          if (err instanceof YouTubeQuotaError) {
            result.stopped = "quota";
            return;
          }
          throw err;
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_CHUNKS }, worker));

    if (result.stopped !== "done" || candidates.length < Math.min(CANDIDATE_SLICE, remaining)) break;
  }

  return result;
}
