import { NextRequest, NextResponse } from "next/server";
import { getSuperSession } from "@/lib/session";
import { resolveImportRows } from "@/lib/pmj-playlists";

// Önizlemede bulunamayan tek satırı düzeltmek için: super admin bir YouTube
// linki yapıştırır (ya da şarkı/sanatçıyı düzeltir), satır yeniden çözülür.
export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const row = {
    line: Number(body?.line) || 0,
    sheet: str(body?.sheet),
    title: str(body?.title),
    artist: str(body?.artist),
    link: str(body?.link),
  };
  if (!row.link && (!row.title || !row.artist)) {
    return NextResponse.json({ error: "Link ya da şarkı + sanatçı gerekli" }, { status: 400 });
  }
  try {
    const { rows, quotaHit } = await resolveImportRows([row]);
    return NextResponse.json({ row: rows[0], quotaHit });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Çözülemedi" }, { status: 500 });
  }
}
