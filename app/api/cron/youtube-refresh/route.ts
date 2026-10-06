import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncPlaylistSources } from "@/lib/playlist-sync";
import { refreshStaleMetadata, type MetadataRefreshResult } from "@/lib/metadata-refresh";
import { withActor } from "@/lib/actor";
import { reportIssue } from "@/lib/ops-log";

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

async function handleGET(req: NextRequest) {
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

  // Mekan sağlık kaydı (0055) ve Sorunlar ekranının kayıtları (0061) 30 günden
  // eskisini tutmaz
  const [{ error: eventsErr }, { error: pushLogErr }, { error: systemLogErr }] = await Promise.all([
    supabaseAdmin.from("venue_events").delete().lt("at", cutoff),
    supabaseAdmin.from("push_deliveries").delete().lt("created_at", cutoff),
    supabaseAdmin.from("system_events").delete().lt("at", cutoff),
  ]);
  const cleanupErr = cacheErr ?? eventsErr ?? pushLogErr ?? systemLogErr;
  if (cleanupErr) {
    await reportIssue({
      area: "cron",
      kind: "cleanup_failed",
      severity: "warn",
      message: "Günlük temizlik (30 gün kuralı) tamamlanamadı",
      error: cleanupErr,
    });
  }

  // Tazeleme çökse de playlist senkronu çalışır: ikisi bağımsız, eskiden tek
  // aday okuma hatası mekan listelerine yeni şarkı gelmesini de durduruyordu
  let refresh: MetadataRefreshResult | null = null;
  let refreshError: string | null = null;
  try {
    refresh = await refreshStaleMetadata(startedAt + REFRESH_TIME_BUDGET_MS);
  } catch (err) {
    refreshError = err instanceof Error ? err.message : "refresh failed";
    await reportIssue({
      area: "cron",
      kind: "metadata_refresh_failed",
      severity: "error",
      message: "Günlük metadata tazeleme çöktü, yarın en eskiden devam edecek",
      error: err,
    });
  }
  const quotaExceeded = refresh?.stopped === "quota";
  if (refresh && refresh.failed > 0) {
    await reportIssue({
      area: "cron",
      kind: "metadata_refresh_partial",
      severity: refresh.stopped === "db" ? "error" : "warn",
      message:
        refresh.stopped === "db"
          ? "Metadata tazeleme veritabanı hataları yüzünden yarıda kaldı"
          : "Metadata tazelemede bazı satırlar yazılamadı, yarın tekrar denenecek",
      detail: { failed: refresh.failed, retries: refresh.writeRetries, refreshed: refresh.refreshed, target: refresh.target },
      error: refresh.writeError,
    });
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
      await reportIssue({
        area: "cron",
        kind: "playlist_sync_failed",
        severity: "error",
        message: "Günlük playlist senkronu çöktü — mekan listelerine yeni şarkılar gelmedi",
        error: err,
      });
    }
  } else {
    await reportIssue({
      area: "cron",
      kind: "quota_exhausted",
      severity: "warn",
      message: "YouTube kotası metadata tazelemede doldu — playlist senkronu yarına kaldı",
    });
  }

  return NextResponse.json({
    ok: refreshError === null,
    cache_cleanup: cacheErr ? cacheErr.message : "done",
    events_cleanup: eventsErr ? eventsErr.message : "done",
    ops_cleanup: pushLogErr?.message ?? systemLogErr?.message ?? "done",
    metadata_refresh: refresh,
    metadata_refresh_error: refreshError,
    playlist_sync: sync,
    playlist_sync_error: syncError,
  });
}

export const GET = (req: NextRequest) => withActor("cron-refresh", () => handleGET(req));
