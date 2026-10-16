import { NextRequest, NextResponse } from "next/server";
import { refreshStaleMetadata, reportMetadataRefresh } from "@/lib/metadata-refresh";
import { withActor } from "@/lib/actor";
import { reportIssue } from "@/lib/ops-log";

// Metadata tazelemenin öğlen telafi turu (08:00 UTC = 11:00 TR, mekanlar
// kapalıyken). 03:00 turu (app/api/cron/youtube-refresh) 180 sn'lik bütçesinde
// songs'un ağırlaşan yazmaları yüzünden günlük hedefin yarısında kalabiliyor
// (15 Eki 2026: 62 binde 28.743). Bu tur yalnız günün açığını kapatır — son
// 20 saatte tazelenenler hedeften düşülür, yani YouTube kotası artmaz; sabah
// turu hedefi bitirdiyse hiçbir şey yapmadan döner. Temizlik ve playlist
// senkronu burada yok, onlar günde bir kez sabah turunda.
export const maxDuration = 300;

const REFRESH_TIME_BUDGET_MS = 240_000;

async function handleGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const refresh = await refreshStaleMetadata(Date.now() + REFRESH_TIME_BUDGET_MS, { catchUp: true });
    await reportMetadataRefresh(refresh, { lastRunOfDay: true });
    return NextResponse.json({ ok: true, metadata_refresh: refresh });
  } catch (err) {
    await reportIssue({
      area: "cron",
      kind: "metadata_refresh_failed",
      severity: "error",
      message: "Metadata telafi turu çöktü, yarın sabah en eskiden devam edecek",
      error: err,
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "refresh failed" },
      { status: 500 }
    );
  }
}

export const GET = (req: NextRequest) => withActor("cron-refresh", () => handleGET(req));
