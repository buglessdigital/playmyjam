// Mekan belge seti şablonlarının testi.
//
// Çalıştırma: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { contractDocuments, documentKindOf, missingContractFields, type ContractFields } from "./contract-template.ts";

const full: ContractFields = {
  commission_pct: 40,
  payment_day: 10,
  start_date: "2026-10-01",
  end_date: null,
  legal_name: "Örnek Gıda Ltd. Şti.",
  tax_office: "Bornova",
  tax_number: "1234567890",
  iban: "TR000000000000000000000000",
  account_holder: "Örnek Gıda Ltd. Şti.",
  billing_email: "muhasebe@ornek.com",
  contact_name: "Ayşe Yılmaz",
  contact_phone: "05550000000",
  notes: "",
};
const settings = { vat_rate: 20, bank_fee_pct: 3.49, other_pct: 0 };

test("eksik koşullar listelenir", () => {
  assert.equal(missingContractFields(null).length, 11);
  assert.deepEqual(missingContractFields(full), []);
  assert.deepEqual(missingContractFields({ ...full, commission_pct: 0, iban: " " }), ["Mekan komisyonu", "IBAN"]);
  // Formdaki metin değerleri de okunur
  assert.deepEqual(missingContractFields({ ...full, commission_pct: "12.5", start_date: "" }), ["Sözleşme başlangıcı"]);
});

test("tam koşullarla üç belge, boşluksuz üretilir", () => {
  const docs = contractDocuments({ venueName: "Mekan X", contract: full, settings, unitPrice: 20 });
  assert.deepEqual(docs.map((d) => d.kind), ["service", "kvkk", "music"]);
  for (const d of docs) {
    assert.equal(documentKindOf(d.title), d.kind);
    assert.ok(d.title.startsWith("Mekan X — "));
    assert.doesNotMatch(d.body, /\[[A-ZÇĞİÖŞÜ ]+\]/, `${d.kind} boşluk içeriyor`);
    assert.match(d.body, /Örnek Gıda Ltd\. Şti\./);
  }
  const service = docs[0].body;
  assert.match(service, /net cironun %40'idir/);
  assert.match(service, /%3,49/);
  assert.match(service, /ayın 10\. günü/);
  assert.match(service, /TR00 0000 0000/);
  assert.match(service, /01 Ekim 2026 tarihinde yürürlüğe girer ve süresizdir/);
  assert.match(service, /17\. UYUŞMAZLIK[\s\S]*18\. EKLER VE ONAY/);
});

test("özel şartlar ayrı madde olarak eklenir, numaralar kayar", () => {
  const [service] = contractDocuments({ venueName: "Mekan X", contract: { ...full, notes: "İlk 3 ay komisyon %50." }, settings, unitPrice: 20 });
  assert.match(service.body, /17\. ÖZEL ŞARTLAR\n\nİlk 3 ay komisyon %50\./);
  assert.match(service.body, /18\. UYUŞMAZLIK[\s\S]*19\. EKLER VE ONAY/);
});

test("koşul yoksa boşluklar işaretli kalır", () => {
  const [service] = contractDocuments({ venueName: "Mekan X", contract: null, settings, unitPrice: 20 });
  assert.match(service.body, /\[IBAN\]/);
  assert.match(service.body, /\[KOMİSYON\]/);
});

test("elle yazılmış başlık belge türü sayılmaz", () => {
  assert.equal(documentKindOf("Mekan X — Ek protokol"), null);
});
