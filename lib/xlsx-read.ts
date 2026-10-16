// Excel (.xlsx) ve CSV okuyucu — PMJ listelerinin içe aktarımı için.
//
// Neden kütüphane değil: tek ihtiyaç "sayfalardaki hücre metinleri". .xlsx bir
// zip arşivi içinde birkaç XML dosyası; Node'un zlib'i açmaya yetiyor. Bağımlılık
// eklemek kilit dosyasını yerelde bozan npm tuzağına (bkz. docs/notlar/
// pmj-kilit-dosyasi-npm-tuzagi.md) ve büyük bir paketin bakımına mal olurdu.
//
// Desteklenenler: paylaşılan metinler, satır içi metin, formül sonucu, sayılar,
// HYPERLINK() formülü ve hücreye eklenmiş köprü (Excel'de "Bağlantı ekle") —
// iki köprü türünde de hücre değeri olarak ADRES döner, görünen metin değil.
// Sayı biçimi, tarih, birleştirilmiş hücre gibi şeyler bilerek yok sayılır.

import { inflateRawSync } from "node:zlib";

export type Sheet = { name: string; rows: string[][] };

/* ---------- zip ---------- */

function readZip(buf: Buffer): Map<string, Buffer> {
  // Merkezi dizinin sonu (EOCD) dosyanın son 64 KB'ı içinde
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Dosya bir Excel (.xlsx) dosyası değil");

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("Bozuk Excel dosyası");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compSize);

    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
    // Başka sıkıştırma yöntemleri Excel'de kullanılmıyor; görmezden gelinir
  }
  return files;
}

/* ---------- xml ---------- */

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

// <t> parçalarının birleşimi (zengin metinde bir hücre birden çok parçaya bölünür)
function textRuns(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += decode(m[1]);
  return out;
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function relTargets(xml: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

function parseSheet(xml: string, shared: string[], links: Map<string, string>): string[][] {
  // Hücreye eklenmiş köprüler: ref → adres
  const linkByRef = new Map<string, string>();
  for (const m of xml.matchAll(/<hyperlink\b([^>]*)\/?>/g)) {
    const ref = attr(m[1], "ref");
    const rid = attr(m[1], "r:id");
    const target = rid ? links.get(rid) : null;
    if (ref && target) linkByRef.set(ref.split(":")[0], target);
  }

  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNum = Number(attr(rowMatch[1], "r") ?? rows.length + 1);
    const cells: string[] = [];
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const type = attr(c[1], "t");
      const inner = c[2] ?? "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const f = inner.match(/<f\b[^>]*>([\s\S]*?)<\/f>/)?.[1];

      let value = "";
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textRuns(inner);
      else if (v !== undefined) value = decode(v);

      const formulaUrl = f ? decode(f).match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1] : undefined;
      const url = formulaUrl ?? (ref ? linkByRef.get(ref) : undefined);
      if (url) value = url;

      const col = ref ? columnIndex(ref) : cells.length;
      cells[col] = value.trim();
    }
    rows[rowNum - 1] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}

export function readXlsx(buf: Buffer): Sheet[] {
  const files = readZip(buf);
  const xmlOf = (path: string) => files.get(path)?.toString("utf8");

  const shared: string[] = [];
  const sharedXml = xmlOf("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const m of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]));
  }

  const workbook = xmlOf("xl/workbook.xml");
  if (!workbook) throw new Error("Dosya bir Excel (.xlsx) dosyası değil");
  const rels = relTargets(xmlOf("xl/_rels/workbook.xml.rels"));

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], "name") ?? `Sayfa ${sheets.length + 1}`;
    const rid = attr(m[1], "r:id");
    const target = rid ? rels.get(rid) : null;
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const xml = xmlOf(path);
    if (!xml) continue;
    const dir = path.slice(0, path.lastIndexOf("/"));
    const file = path.slice(path.lastIndexOf("/") + 1);
    const links = relTargets(xmlOf(`${dir}/_rels/${file}.rels`));
    sheets.push({ name, rows: parseSheet(xml, shared, links) });
  }
  return sheets;
}

/* ---------- csv ---------- */

// Türkçe Excel CSV'yi ";" ile yazar; ayraç ilk satırdan sezilir.
export function readCsv(text: string, name = "Sayfa 1"): Sheet[] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return [{ name, rows }];
}

export function readSpreadsheet(buf: Buffer, fileName: string): Sheet[] {
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (isZip) return readXlsx(buf);
  if (/\.xls$/i.test(fileName)) {
    throw new Error("Eski .xls biçimi desteklenmiyor — Excel'de 'Farklı Kaydet → .xlsx' ile kaydedin");
  }
  return readCsv(buf.toString("utf8"), fileName.replace(/\.[^.]+$/, ""));
}
