// PMJ listesi içe aktarımı: Excel/CSV satırlarını liste → şarkı satırlarına çevirir.
// Saf fonksiyon (DB'ye dokunmaz) — `npm test` altında doğrudan koşar.
//
// Beklenen biçim (başlık satırı zorunlu, sütun sırası serbest):
//   Playlist | Şarkı | Sanatçı | YouTube linki
// "Playlist" sütunu yoksa her SAYFA bir liste sayılır, adı sayfa adıdır.
// Link varsa eşleşme birebir olur; yoksa şarkı adı + sanatçıyla havuzda aranır.

import type { Sheet } from "./xlsx-read.ts";
import { fold } from "./song-match.ts";

export type ImportRow = {
  /** Excel'deki satır numarası (kullanıcıya hata gösterirken) */
  line: number;
  sheet: string;
  title: string;
  artist: string;
  link: string;
};

export type ImportList = { name: string; rows: ImportRow[] };

const HEADERS = {
  playlist: ["playlist", "liste", "calma listesi", "liste adi", "playlist adi"],
  title: ["sarki", "sarki adi", "parca", "baslik", "title", "song", "track", "eser"],
  artist: ["sanatci", "sanatci adi", "artist", "sarkici", "grup", "yorumcu"],
  link: ["link", "youtube", "youtube linki", "youtube link", "url", "baglanti", "video", "youtube music"],
} as const;

type Field = keyof typeof HEADERS;

function headerField(cell: string): Field | null {
  const f = fold(cell);
  if (!f) return null;
  for (const field of Object.keys(HEADERS) as Field[]) {
    if ((HEADERS[field] as readonly string[]).includes(f)) return field;
  }
  // "YouTube Music Linki", "Şarkı İsmi" gibi uzun başlıklar
  if (f.includes("link") || f.includes("url") || f.includes("youtube")) return "link";
  if (f.includes("sanatci") || f.includes("artist")) return "artist";
  if (f.includes("sarki") || f.includes("parca") || f.includes("title")) return "title";
  if (f.includes("playlist") || f.includes("liste")) return "playlist";
  return null;
}

// İlk 10 satırda başlık aranır: en az şarkı + (sanatçı ya da link) sütunu olmalı
function findHeader(rows: string[][]): { at: number; cols: Partial<Record<Field, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cols: Partial<Record<Field, number>> = {};
    (rows[i] ?? []).forEach((cell, idx) => {
      const field = headerField(cell ?? "");
      if (field && cols[field] === undefined) cols[field] = idx;
    });
    if (cols.title !== undefined && (cols.artist !== undefined || cols.link !== undefined)) {
      return { at: i, cols };
    }
  }
  return null;
}

export function parseImport(sheets: Sheet[]): { lists: ImportList[]; problems: string[] } {
  const byName = new Map<string, ImportList>();
  const problems: string[] = [];

  for (const sheet of sheets) {
    const nonEmpty = sheet.rows.filter((r) => r.some((c) => c));
    if (nonEmpty.length === 0) continue;

    const header = findHeader(sheet.rows);
    if (!header) {
      problems.push(
        `"${sheet.name}" sayfasında başlık satırı bulunamadı (en az "Şarkı" ve "Sanatçı" ya da "Link" sütunu gerekli)`
      );
      continue;
    }

    const { cols } = header;
    const cell = (row: string[], field: Field) =>
      cols[field] === undefined ? "" : (row[cols[field]!] ?? "").trim();

    // Birleştirilmiş hücrelerde liste adı yalnızca ilk satırda durur: boş
    // hücre bir öncekinin devamı sayılır
    let lastList = "";
    for (let i = header.at + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i] ?? [];
      const title = cell(row, "title");
      const artist = cell(row, "artist");
      const link = cell(row, "link");
      const listCell = cell(row, "playlist");
      if (listCell) lastList = listCell;
      if (!title && !artist && !link) continue;

      const listName = (cols.playlist !== undefined ? lastList : sheet.name).trim();
      if (!listName) {
        problems.push(`${sheet.name} · satır ${i + 1}: liste adı boş`);
        continue;
      }
      if (!link && (!title || !artist)) {
        problems.push(`${sheet.name} · satır ${i + 1}: link yoksa şarkı ve sanatçı ikisi de gerekli`);
        continue;
      }

      const key = listName.toLocaleLowerCase("tr");
      let list = byName.get(key);
      if (!list) byName.set(key, (list = { name: listName, rows: [] }));
      list.rows.push({ line: i + 1, sheet: sheet.name, title, artist, link });
    }
  }

  return { lists: [...byName.values()], problems };
}
