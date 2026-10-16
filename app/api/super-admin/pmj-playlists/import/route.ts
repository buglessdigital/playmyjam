import { NextRequest, NextResponse } from "next/server";
import { getSuperSession } from "@/lib/session";
import { readSpreadsheet } from "@/lib/xlsx-read";
import { parseImport } from "@/lib/pmj-import";
import { resolveImportRows } from "@/lib/pmj-playlists";

// PMJ listesi içe aktarımı — ÖNİZLEME. Hiçbir liste yazılmaz: dosya okunur,
// her satır havuzdaki bir şarkıya bağlanır ve sonuç ekrana döner. Super admin
// bulunamayanları düzeltip "Kaydet" der (POST /api/super-admin/pmj-playlists).
//
// Tek yan etki: linkli olup havuzda olmayan şarkılar havuza yazılır (50 video =
// 1 YouTube birimi) — önizlemede de "bulundu" görünebilsinler diye.

export const maxDuration = 300;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 5000;

export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Dosya 4 MB'tan büyük" }, { status: 400 });
  }

  try {
    const sheets = readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name);
    const { lists, problems } = parseImport(sheets);
    const total = lists.reduce((n, l) => n + l.rows.length, 0);
    if (total === 0) {
      return NextResponse.json(
        { error: problems[0] ?? "Dosyada şarkı satırı bulunamadı" },
        { status: 400 }
      );
    }
    if (total > MAX_ROWS) {
      return NextResponse.json({ error: `En fazla ${MAX_ROWS} satır` }, { status: 400 });
    }

    const { rows, quotaHit } = await resolveImportRows(lists.flatMap((l) => l.rows));
    let i = 0;
    const resolved = lists.map((l) => ({ name: l.name, rows: rows.slice(i, (i += l.rows.length)) }));
    return NextResponse.json({ lists: resolved, problems, quotaHit });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Dosya okunamadı" },
      { status: 400 }
    );
  }
}
