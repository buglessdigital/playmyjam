import { NextRequest, NextResponse } from "next/server";
import { fillMissingSongGenres } from "@/lib/song-genre";
import { reportIssue } from "@/lib/ops-log";

// 10 dakikada bir: haritadaki mekanlarda çalınmış, türü bilinmeyen şarkıları
// iTunes'tan doldurur — bkz. lib/song-genre.ts. Kart da açılırken birkaçını
// öğreniyor ama mekan başına ayda yüzlerce farklı şarkı var; iTunes'un
// dakikalık sınırı yüzünden asıl yükü bu tur taşır.
export const maxDuration = 300;

/** Sonraki tur başlamadan bitsin; iTunes isteği en çok 2,5 sn */
const RUN_MS = 240_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await fillMissingSongGenres(Date.now() + RUN_MS);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    await reportIssue({
      area: "cron",
      kind: "song_genres_failed",
      severity: "warn",
      message: "Şarkı türü turu çöktü — haritadaki tür payları bu turda güncellenmedi",
      error: err,
    });
    return NextResponse.json({ error: err instanceof Error ? err.message : "song genres failed" }, { status: 500 });
  }
}
