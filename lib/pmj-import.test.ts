// PMJ listesi içe aktarımının testi: Excel okuyucu (lib/xlsx-read.ts) ve
// satırları listelere ayıran ayrıştırıcı (lib/pmj-import.ts).
//
// Çalıştırma: npm test
//
// .xlsx dosyası testin içinde üretilir (sıkıştırmasız zip): gerçek Excel'in
// yazdığı parçalar — paylaşılan metin, satır içi metin, HYPERLINK formülü,
// hücreye eklenmiş köprü ve boş hücre atlaması — bilerek karışık kullanılır.

import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";

import { readCsv, readSpreadsheet, readXlsx } from "./xlsx-read.ts";
import { parseImport } from "./pmj-import.ts";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

// Yarısı sıkıştırmasız (method 0), yarısı deflate (method 8): okuyucu ikisini de görsün
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  let n = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const method = n++ % 2 === 0 ? 0 : 8;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const workbook = `<?xml version="1.0"?><workbook xmlns:r="r"><sheets>
<sheet name="Listeler" sheetId="1" r:id="rId1"/><sheet name="Rock &amp; Roll" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const workbookRels = `<Relationships>
<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
const shared = `<sst><si><t>Playlist</t></si><si><t>Şarkı</t></si><si><t>Sanatçı</t></si><si><t>YouTube Linki</t></si>
<si><t>Türkçe Pop</t></si><si><r><t>Ben </t></r><r><t>Değilim</t></r></si><si><t>Mela Bedel</t></si></sst>`;
const sheet1 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="str"><f>HYPERLINK("https://music.youtube.com/watch?v=rqa0KYdzoEc","dinle")</f><v>dinle</v></c></row>
<row r="3"><c r="B3" t="inlineStr"><is><t>Sımsıkı</t></is></c><c r="C3" t="inlineStr"><is><t>Kenan Doğulu</t></is></c><c r="D3" t="inlineStr"><is><t>bağlantı</t></is></c></row>
<row r="5"><c r="A5" t="inlineStr"><is><t>Yabancı Pop</t></is></c><c r="B5" t="inlineStr"><is><t>Espresso</t></is></c><c r="C5" t="inlineStr"><is><t>Sabrina Carpenter</t></is></c></row>
</sheetData><hyperlinks><hyperlink ref="D3" r:id="rId9"/></hyperlinks></worksheet>`;
const sheet1Rels = `<Relationships><Relationship Id="rId9" Target="https://youtu.be/1q2AzcEclSo" TargetMode="External"/></Relationships>`;
const sheet2 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Sanatçı</t></is></c><c r="B1" t="inlineStr"><is><t>Şarkı Adı</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Duman</t></is></c><c r="B2" t="inlineStr"><is><t>Bu Akşam</t></is></c></row>
</sheetData></worksheet>`;

const xlsx = zip({
  "[Content_Types].xml": "<Types/>",
  "xl/workbook.xml": workbook,
  "xl/_rels/workbook.xml.rels": workbookRels,
  "xl/sharedStrings.xml": shared,
  "xl/worksheets/sheet1.xml": sheet1,
  "xl/worksheets/_rels/sheet1.xml.rels": sheet1Rels,
  "xl/worksheets/sheet2.xml": sheet2,
});

test("xlsx: sayfalar, paylaşılan/satır içi metin, köprüler", () => {
  const sheets = readXlsx(xlsx);
  assert.deepEqual(sheets.map((s) => s.name), ["Listeler", "Rock & Roll"]);
  const rows = sheets[0].rows;
  assert.deepEqual(rows[0], ["Playlist", "Şarkı", "Sanatçı", "YouTube Linki"]);
  // Zengin metin parçaları birleşir, HYPERLINK formülünden adres alınır
  assert.deepEqual(rows[1], ["Türkçe Pop", "Ben Değilim", "Mela Bedel", "https://music.youtube.com/watch?v=rqa0KYdzoEc"]);
  // Boş A3 hücresi atlanmış; hücreye eklenmiş köprünün adresi görünen metnin yerine geçer
  assert.deepEqual(rows[2], ["", "Sımsıkı", "Kenan Doğulu", "https://youtu.be/1q2AzcEclSo"]);
  assert.deepEqual(rows[3], []);
  assert.equal(rows[4][1], "Espresso");
});

test("içe aktarım: Playlist sütunu, birleşik hücre devamı, sayfa adı = liste", () => {
  const { lists, problems } = parseImport(readSpreadsheet(xlsx, "listeler.xlsx"));
  assert.deepEqual(problems, []);
  assert.deepEqual(
    lists.map((l) => [l.name, l.rows.map((r) => r.title)]),
    [
      // A3 boş: üstteki "Türkçe Pop"un devamı sayılır
      ["Türkçe Pop", ["Ben Değilim", "Sımsıkı"]],
      ["Yabancı Pop", ["Espresso"]],
      // İkinci sayfada Playlist sütunu yok: liste adı sayfa adı
      ["Rock & Roll", ["Bu Akşam"]],
    ]
  );
  assert.equal(lists[0].rows[1].line, 3);
  assert.equal(lists[0].rows[1].link, "https://youtu.be/1q2AzcEclSo");
});

test("csv: Türkçe Excel ';' ayracı, tırnaklı hücre, BOM", () => {
  const csv = '﻿Playlist;Şarkı;Sanatçı;Link\nBar;"Bir; İki";Duman;\nBar;Yalnız;;\n';
  const { lists, problems } = parseImport(readCsv(csv));
  assert.deepEqual(lists, [{ name: "Bar", rows: [{ line: 2, sheet: "Sayfa 1", title: "Bir; İki", artist: "Duman", link: "" }] }]);
  // Link de sanatçı da yoksa satır alınmaz, sebebi söylenir
  assert.equal(problems.length, 1);
  assert.match(problems[0], /satır 3/);
});

test("başlık yoksa sayfa reddedilir", () => {
  const { lists, problems } = parseImport(readCsv("Ben Değilim;Mela Bedel\nSımsıkı;Kenan Doğulu\n"));
  assert.equal(lists.length, 0);
  assert.match(problems[0], /başlık satırı/);
});

test("eski .xls açıkça reddedilir", () => {
  assert.throws(() => readSpreadsheet(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), "liste.xls"), /\.xls/);
});
