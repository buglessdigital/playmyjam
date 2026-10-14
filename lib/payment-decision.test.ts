import assert from "node:assert/strict";
import { test } from "node:test";
import { ABANDON_AFTER_MS, decide } from "./payment-decision.ts";

// Yanıt biçimleri 15 Eki 2026'da canlı iyzico'dan alınan gerçek /payment/detail yanıtları
const order = { id: "56e3b5fc-bc29-4bfa-b93a-68192275cf7e", total: "20.00" };
const OLD = ABANDON_AFTER_MS + 1;
const YOUNG = 20 * 60_000;

const paid = { status: "success", paymentStatus: "SUCCESS", paymentId: "4234513017", basketId: order.id, paidPrice: 20, price: 20, currency: "TRY" };

test("ödenmiş, sepet ve tutar tutuyor → jeton yüklenir", () => {
  assert.equal(decide(order, paid, YOUNG), "confirm");
});

test("ödenmiş ama tutar ya da sepet farklı → elle kontrol", () => {
  assert.equal(decide(order, { ...paid, paidPrice: 40 }, YOUNG), "mismatch");
  assert.equal(decide(order, { ...paid, basketId: "baska-siparis" }, YOUNG), "mismatch");
});

test("banka reddi → failed", () => {
  const declined = { status: "failure", errorCode: "10220", errorMessage: "Ödeme alınamadı", paymentId: "4117036982", paymentStatus: "FAILURE" };
  assert.equal(decide(order, declined, YOUNG), "fail");
});

test("kayıt yok ya da 3DS yarıda: 1 saat beklenir, sonra kapanır", () => {
  const noRecord = { status: "failure", errorCode: "5087", errorMessage: "Üye işyerine ait ödeme kaydı bulunamadı" };
  const threeDs = { ...paid, paymentStatus: "INIT_THREEDS" };
  assert.equal(decide(order, noRecord, YOUNG), "wait");
  assert.equal(decide(order, noRecord, OLD), "abandon");
  assert.equal(decide(order, threeDs, YOUNG), "wait");
  assert.equal(decide(order, threeDs, OLD), "abandon");
});

test("tanınmayan yanıt → dokunulmaz", () => {
  assert.equal(decide(order, { status: "failure", errorCode: "1000", errorMessage: "Geçersiz imza" }, OLD), "unknown");
});
