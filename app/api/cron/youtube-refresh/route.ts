import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncPlaylistSources } from "@/lib/playlist-sync";
import { refreshStaleMetadata, type MetadataRefreshResult } from "@/lib/metadata-refresh";

// YouTube API veri saklama uyumu (Developer Policy III.E.4): günlük cron.
// 1) 30 günden eski search_cache satırları silinir.
// 2) songs metadata'sı en eskiden başlayarak tazelenir — bkz. lib/metadata-refresh.ts
//    (havuzun 1/20'si, ~760 bin havuzda ~760 birim).
// 3) Otomatik senkronu açık YouTube playlist'lerine eklenen yeni şarkılar alınır
//    (bkz. lib/playlist-sync.ts — tipik gün ~20 birim, tavanı 1000).
// Üçü tek route'ta: üçü de aynı kota havuzunu kullanıyor — tek yerde toplamak
// bütçeyi görünür kılıyor. Yeni çıkanlar turu ayrı: app/api/cron/catalog-new.
export const maxDuration = 300;

const RETENTION_DAYS = 30;
// Tazeleme bu süreyi aşmasın: senkron ve yanıt için pay kalsın
const REFRESH_TIME_BUDGET_MS = 180_000;

// Haftada bir tam tarama: itemCount ön kontrolü aynı gün 1 ekleyip 1 silmeyi
// göremiyor (sayı sabit kalır), pazar turu o kör noktayı kapatır.
const FULL_SWEEP_WEEKDAY = 0;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const cutoff = new Date(startedAt - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: cacheErr } = await supabaseAdmin
    .from("search_cache")
    .delete()
    .lt("cached_at", cutoff);

  let refresh: MetadataRefreshResult;
  try {
    refresh = await refreshStaleMetadata(startedAt + REFRESH_TIME_BUDGET_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : "refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const quotaExceeded = refresh.stopped === "quota";

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
    metadata_refresh: refresh,
    playlist_sync: sync,
    playlist_sync_error: syncError,
  });
}
