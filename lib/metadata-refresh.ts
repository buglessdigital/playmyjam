import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshVideoMetadata, YouTubeQuotaError, type VideoRefresh } from "@/lib/youtube";
import { purgeUnplayableSong } from "@/lib/playlist";
import { reportIssue } from "@/lib/ops-log";

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
// Adaylar tek RPC ile dilim dilim alınır (0074 stale_song_candidates, kaldığı
// yerden; yoksa 0054 stale_song_video_ids); 20 bin
// aday ~2 sn, API rolünün sorgu sınırı 8 sn.
const CANDIDATE_SLICE = 20_000;
// Parti boyu (videos.list 20 çağrı)
const CHUNK = 1_000;
// Tek refresh_song_metadata çağrısının satır sayısı. 0056'nın iki trigram
// (GIN) indeksi her güncellemeye yazıyor: 30 Eyl 2026 ölçümü 1.000 satır
// 5,7-13 sn (8 sn sınırına takıldı), 250 satır 0,5-0,85 sn.
const WRITE_CHUNK = 250;
// Yazılamayan dilim kısa bir beklemeden sonra ikiye bölünüp yeniden denenir
// (250 → 125 → 63). 6 Eki 2026: aynı 250'lik çağrı sakin anda 0,6-1 sn, cron
// sırasında ortalama 2 sn, tepede 8 sn — tur kendi ölü satırlarıyla songs'un
// autovacuum'unu tetikliyor, vacuum 9 indeksi (iki trigram GIN dahil) tararken
// yazmalar sınıra dayanıyor. Bölmek hem anlık yükün geçmesini bekler hem de
// tek çağrının işini küçültür. En küçük dilim de iki kez düşerse atlanır:
// satırlar en eski kaldığı için ertesi gün ilk sırada gelir.
const MIN_WRITE_CHUNK = 63;
const WRITE_BACKOFF_MS = 2_000;
// Bu kadar en küçük dilim düşerse veritabanı gerçekten sorunlu demektir, tur
// durur (playlist senkronu yine çalışır).
const MAX_FAILED_WRITES = 4;
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
  // Yazılamayıp atlanan satırlar (bkz. MAX_FAILED_WRITES)
  failed: number;
  // Zaman aşımı yüzünden bölünerek yeniden denenen yazma sayısı
  writeRetries: number;
  writeError: string | null;
  units: number;
  stopped: "done" | "time" | "quota" | "db";
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

// Telafi turu (app/api/cron/metadata-catchup) yalnız günün açığını kapatır:
// son bu kadar saatte tazelenen satırlar günlük hedeften düşülür, kota artmaz
const CATCH_UP_WINDOW_HOURS = 20;

export async function refreshStaleMetadata(
  deadline: number,
  opts: { catchUp?: boolean } = {}
): Promise<MetadataRefreshResult> {
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
  let target = Math.min(MAX_BATCH, Math.max(MIN_BATCH, Math.ceil(pool / CYCLE_DAYS)));
  if (opts.catchUp) {
    const since = new Date(Date.now() - CATCH_UP_WINDOW_HOURS * 3_600_000).toISOString();
    const { count: done, error } = await timed("count", async () =>
      supabaseAdmin
        .from("songs")
        .select("id", { count: "exact", head: true })
        .gt("metadata_refreshed_at", since)
    );
    if (error) throw new Error(`günün tazelenen satırları sayılamadı: ${error.message}`);
    target = Math.max(0, target - (done ?? 0));
  }
  const result: MetadataRefreshResult = {
    pool, target, refreshed: 0, delisted: 0, purged: 0, failed: 0, writeRetries: 0, writeError: null, units: 0, stopped: "done", ms,
  };
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 86_400_000).toISOString();
  let failedWrites = 0;

  type WriteOut = { unplayable: { song_id: string }[]; written: Row[]; failed: Row[] };
  const write = async (slice: Row[]) =>
    supabaseAdmin.rpc("refresh_song_metadata", { p_rows: slice });

  // Dilim yazma: düşerse bekleyip ikiye böler (bkz. MIN_WRITE_CHUNK); en küçük
  // dilim iki kez düşerse o satırlar `failed` olarak döner
  async function writeSlice(slice: Row[]): Promise<WriteOut> {
    const first = await write(slice);
    if (!first.error) return { unplayable: (first.data ?? []) as { song_id: string }[], written: slice, failed: [] };
    result.writeError = `metadata yazılamadı: ${first.error.message}`;
    if (Date.now() > deadline) return { unplayable: [], written: [], failed: slice };
    result.writeRetries++;
    await new Promise((r) => setTimeout(r, WRITE_BACKOFF_MS));

    if (slice.length <= MIN_WRITE_CHUNK) {
      const again = await write(slice);
      if (!again.error) return { unplayable: (again.data ?? []) as { song_id: string }[], written: slice, failed: [] };
      result.writeError = `metadata yazılamadı: ${again.error.message}`;
      return { unplayable: [], written: [], failed: slice };
    }
    const mid = Math.ceil(slice.length / 2);
    const a = await writeSlice(slice.slice(0, mid));
    const b = await writeSlice(slice.slice(mid));
    return {
      unplayable: [...a.unplayable, ...b.unplayable],
      written: [...a.written, ...b.written],
      failed: [...a.failed, ...b.failed],
    };
  }

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

    // Yanıtta dönmeyen video silinmiş/gizlenmiş: metadata artık doğrulanamaz,
    // gömülemez işaretlenir ki arama ve otomatik dolum önermesin
    const rows: Row[] = ids.map((id) => {
      const m = meta.get(id);
      return m ? { youtube_video_id: id, ...m } : { youtube_video_id: id, embeddable: false };
    });

    const unplayable = await timed("write", async () => {
      const out: { song_id: string }[] = [];
      for (let i = 0; i < rows.length && result.stopped === "done"; i += WRITE_CHUNK) {
        const { unplayable, written, failed } = await writeSlice(rows.slice(i, i + WRITE_CHUNK));
        if (failed.length > 0) {
          result.failed += failed.length;
          if (++failedWrites >= MAX_FAILED_WRITES) result.stopped = "db";
        }
        for (const r of written) {
          if (meta.get(r.youtube_video_id)) result.refreshed++;
          else result.delisted++;
        }
        out.push(...unplayable);
      }
      return out;
    });

    // Hak sahibi embed'i kapatmış ya da video kalkmış: mekan kataloglarından düşür
    await timed("purge", async () => {
      for (const row of unplayable) {
        await purgeUnplayableSong(row.song_id);
        result.purged++;
      }
    });
  }

  // Bir sonraki aday diliminin başlangıcı (0074). Her dilim indeksin başından
  // okununca az önce tazelenen satırların ölü kayıtları üzerinden geçiyordu:
  // 7 Eki 2026 ikinci okuma soğuk önbellekte 8 sn sınırını aştı.
  let after: string | null = null;
  // 0074 henüz uygulanmamışsa eski RPC'ye düşülür (her dilim baştan okur)
  let keyset = true;

  async function readCandidates(limit: number): Promise<string[]> {
    if (keyset) {
      const { data, error } = await supabaseAdmin.rpc("stale_song_candidates", {
        p_cutoff: cutoff,
        p_after: after,
        p_limit: limit,
      });
      if (!error) {
        const out = (data ?? { ids: [], last: null }) as { ids: string[]; last: string | null };
        if (out.last) after = out.last;
        return out.ids;
      }
      if (error.code !== "PGRST202") throw new Error(error.message);
      keyset = false;
    }
    const { data, error } = await supabaseAdmin.rpc("stale_song_video_ids", { p_cutoff: cutoff, p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []) as string[];
  }

  while (target > 0 && result.refreshed + result.delisted + result.failed < target) {
    const remaining = target - result.refreshed - result.delisted - result.failed;
    // Bir kez yeniden denenir: ilk deneme soğuk önbellekte sınıra dayanırsa
    // okuduğu sayfalar ikinciyi hızlandırır (4 Eki 2026: 7,9 sn → 0,13 sn).
    // Asıl çözüm 0066'nın kapsayan indeksi + 0074'ün kaldığı yerden okuması.
    const candidates = await timed("select", async () => {
      let message = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await readCandidates(Math.min(CANDIDATE_SLICE, remaining));
        } catch (err) {
          message = err instanceof Error ? err.message : String(err);
        }
      }
      throw new Error(`adaylar okunamadı: ${message}`);
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

// 30 gün kuralına uyum durumu: gerçek risk yalnız budur. Tek tek yazılamayan
// satırlar (süre sınırına denk gelen son dilim, zaman aşımı) ertesi tura en
// eski olarak kalır ve risk değildir — 6-16 Eki 2026 her gün "bazı satırlar
// yazılamadı" uyarısı düştü, hiçbiri 30 günü aşmadı.
export const DUE_SOON_DAYS = 28;

export async function metadataCompliance(): Promise<{ overdue: number; dueSoon: number }> {
  const before = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const [over, soon] = await Promise.all([
    supabaseAdmin.from("songs").select("id", { count: "exact", head: true }).lt("metadata_refreshed_at", before(30)),
    supabaseAdmin
      .from("songs")
      .select("id", { count: "exact", head: true })
      .lt("metadata_refreshed_at", before(DUE_SOON_DAYS)),
  ]);
  if (over.error || soon.error) throw new Error((over.error ?? soon.error)!.message);
  return { overdue: over.count ?? 0, dueSoon: soon.count ?? 0 };
}

// Tur sonu raporu: yalnız gerçek sorun Sorunlar ekranına (ve Sentry'ye) düşer.
//   * veritabanı tekrar tekrar düştü (stopped "db") → hata
//   * 30 günü geçen satır var → hata
//   * günün son turundan sonra 2 gün içinde 30 günü dolacak satır kaldı → uyarı
//     (sabah turundan sonra sorulmaz: öğlen telafi turu kalanı tamamlar)
export async function reportMetadataRefresh(
  refresh: MetadataRefreshResult,
  opts: { lastRunOfDay: boolean }
): Promise<void> {
  const detail = {
    failed: refresh.failed,
    retries: refresh.writeRetries,
    refreshed: refresh.refreshed,
    target: refresh.target,
    stopped: refresh.stopped,
  };
  if (refresh.stopped === "db") {
    await reportIssue({
      area: "cron",
      kind: "metadata_refresh_partial",
      severity: "error",
      message: "Metadata tazeleme veritabanı hataları yüzünden yarıda kaldı",
      detail,
      error: refresh.writeError,
    });
  }
  let compliance: { overdue: number; dueSoon: number };
  try {
    compliance = await metadataCompliance();
  } catch {
    // Sayım düşerse bir sonraki tur yeniden bakar; tazelemenin kendisi bitti
    return;
  }
  if (compliance.overdue > 0) {
    await reportIssue({
      area: "cron",
      kind: "metadata_overdue",
      severity: "error",
      message: `${compliance.overdue} şarkının metadata'sı 30 günü geçti (YouTube kuralı)`,
      detail: { ...detail, ...compliance },
    });
  } else if (opts.lastRunOfDay && compliance.dueSoon > 0) {
    await reportIssue({
      area: "cron",
      kind: "metadata_due_soon",
      severity: "warn",
      message: `${compliance.dueSoon} şarkının metadata'sı 2 gün içinde 30 günü dolduracak — turlar yetişmiyor`,
      detail: { ...detail, ...compliance },
    });
  }
}
