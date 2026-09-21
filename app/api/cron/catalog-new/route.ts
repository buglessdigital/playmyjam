import { NextRequest, NextResponse } from "next/server";
import { refreshCatalogNewReleases } from "@/lib/catalog-new";

// Günlük "yeni çıkanlar" turu — bkz. lib/catalog-new.ts. youtube-refresh'ten
// ayrı tutuldu: ikisi 300 sn'lik süreyi paylaşmasın. Bu tur kota sıfırlanmadan
// (07:00 UTC) hemen önce koşup gecenin artan kotasını kullanıyor.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshCatalogNewReleases();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "catalog refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
