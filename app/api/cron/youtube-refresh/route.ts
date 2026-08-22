import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshVideoMetadata, YouTubeQuotaError } from "@/lib/youtube";
import { syncPlaylistSources } from "@/lib/playlist-sync";
import { purgeUnplayableSong } from "@/lib/playlist";

// YouTube API veri saklama uyumu (Developer Policy III.E.4): günlük cron.
// 1) 30 günden eski search_cache satırları silinir.
// 2) 30 gündür tazelenmemiş songs metadata'sı videos.list ile yenilenir.
// 3) Otomatik senkronu açık YouTube playlist'lerine eklenen yeni şarkılar alınır
//    (bkz. lib/playlist-sync.ts — tipik gün ~20 birim, tavanı 1000).
// Üçü tek route'ta: Vercel'in cron sayısı plana göre sınırlı, ayrıca üçü de aynı
// kota havuzunu kullanıyor — tek yerde toplamak bütçeyi görünür kılıyor.
//
// search.list artık hiçbir yerde çağrılmıyor, bu yüzden günlük tüketimin tamamı
// bu route'tan geçiyor ve üst sınırı buradan okunabiliyor:
//   tazeleme  ≤ REFRESH_MAX/50 = 100 birim
//   senkron   ≤ 1000 birim
const RETENTION_DAYS = 30;

// Parti büyüklüğü havuzla birlikte büyür: tohumlama sonrası havuz on binlerce
// satır olabiliyor ve sabit 500'lük parti 30 günlük turu tamamlayamıyordu
// (tamamlanamayan tur = tazelenmemiş metadata = uyum ihlali).
const REFRESH_MIN = 500;
const REFRESH_MAX = 5000;
const UPDATE_CONCURRENCY = 20;

// Haftada bir tam tarama: itemCount ön kontrolü aynı gün 1 ekleyip 1 silmeyi
// göremiyor (sayı sabit kalır), pazar turu o kör noktayı kapatır.
const FULL_SWEEP_WEEKDAY = 0;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Havuzun tamamı RETENTION_DAYS içinde bir kez dönsün
  const { count: poolSize } = await supabaseAdmin
    .from("songs")
    .select("id", { count: "exact", head: true });
  const refreshBatch = Math.min(
    REFRESH_MAX,
    Math.max(REFRESH_MIN, Math.ceil((poolSize ?? 0) / RETENTION_DAYS))
  );

  const { error: cacheErr } = await supabaseAdmin
    .from("search_cache")
    .delete()
    .lt("cached_at", cutoff);

  const { data: stale, error: staleErr } = await supabaseAdmin
    .from("songs")
    .select("id, youtube_video_id")
    .lt("metadata_refreshed_at", cutoff)
    .order("metadata_refreshed_at", { ascending: true })
    .limit(refreshBatch);

  if (staleErr) {
    return NextResponse.json({ error: staleErr.message }, { status: 500 });
  }

  const rows = stale ?? [];
  let refreshed = 0;
  let delisted = 0;
  let quotaExceeded = false;

  try {
    const meta = await refreshVideoMetadata(rows.map((r) => r.youtube_video_id));
    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i += UPDATE_CONCURRENCY) {
      await Promise.all(
        rows.slice(i, i + UPDATE_CONCURRENCY).map(async (row) => {
          const m = meta.get(row.youtube_video_id);
          if (m) {
            const { error } = await supabaseAdmin
              .from("songs")
              .update({ ...m, metadata_refreshed_at: now })
              .eq("id", row.id);
            if (!error) {
              refreshed++;
              // Video duruyor ama hak sahibi embed'i kapatmış: en sık yol bu
              if (!m.embeddable) await purgeUnplayableSong(row.id);
            }
          } else {
            // Video silinmiş/gizlenmiş — metadata artık doğrulanamaz; embed dışı
            // bırak ki arama ve otomatik dolum bir daha önermesin
            const { error } = await supabaseAdmin
              .from("songs")
              .update({ embeddable: false, metadata_refreshed_at: now })
              .eq("id", row.id);
            if (!error) {
              delisted++;
              await purgeUnplayableSong(row.id);
            }
          }
        })
      );
    }
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      // Kota dolu — tazeleme yarınki çalışmaya kalır, cache temizliği yine de yapıldı
      quotaExceeded = true;
    } else {
      const message = err instanceof Error ? err.message : "refresh failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // 3) Playlist senkronu. Kota zaten dolduysa hiç denenmez — dokunulmayan
  //    kaynakların sırası bozulmadan yarına devreder.
  let sync = null;
  let syncError: string | null = null;
  if (!quotaExceeded) {
    try {
      sync = await syncPlaylistSources({
        force: new Date().getUTCDay() === FULL_SWEEP_WEEKDAY,
      });
    } catch (err) {
      syncError = err instanceof Error ? err.message : "playlist sync failed";
    }
  }

  return NextResponse.json({
    ok: true,
    cache_cleanup: cacheErr ? cacheErr.message : "done",
    pool_size: poolSize ?? 0,
    refresh_batch: refreshBatch,
    stale_found: rows.length,
    refreshed,
    delisted,
    quota_exceeded: quotaExceeded,
    playlist_sync: sync,
    playlist_sync_error: syncError,
  });
}
