import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshVideoMetadata, YouTubeQuotaError } from "@/lib/youtube";

// YouTube API veri saklama uyumu (Developer Policy III.E.4): günlük cron.
// 1) 30 günden eski search_cache satırları silinir.
// 2) 30 gündür tazelenmemiş songs metadata'sı videos.list ile yenilenir
//    (50'lik parti = 1 birim → günlük 500 şarkı ≈ 10 birim, kota etkisi ihmal edilir).
const RETENTION_DAYS = 30;
const REFRESH_BATCH = 500;
const UPDATE_CONCURRENCY = 20;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: cacheErr } = await supabaseAdmin
    .from("search_cache")
    .delete()
    .lt("cached_at", cutoff);

  const { data: stale, error: staleErr } = await supabaseAdmin
    .from("songs")
    .select("id, youtube_video_id")
    .lt("metadata_refreshed_at", cutoff)
    .order("metadata_refreshed_at", { ascending: true })
    .limit(REFRESH_BATCH);

  if (staleErr) {
    return NextResponse.json({ error: staleErr.message }, { status: 500 });
  }

  const rows = stale ?? [];
  let refreshed = 0;
  let delisted = 0;

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
            if (!error) refreshed++;
          } else {
            // Video silinmiş/gizlenmiş — metadata artık doğrulanamaz; embed dışı
            // bırak ki arama ve otomatik dolum bir daha önermesin
            const { error } = await supabaseAdmin
              .from("songs")
              .update({ embeddable: false, metadata_refreshed_at: now })
              .eq("id", row.id);
            if (!error) delisted++;
          }
        })
      );
    }
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      // Kota dolu — tazeleme yarınki çalışmaya kalır, cache temizliği yine de yapıldı
      return NextResponse.json({ ok: true, quota_exceeded: true, refreshed, delisted });
    }
    const message = err instanceof Error ? err.message : "refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cache_cleanup: cacheErr ? cacheErr.message : "done",
    stale_found: rows.length,
    refreshed,
    delisted,
  });
}
