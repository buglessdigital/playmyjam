import { expect, test } from "@playwright/test";
import { CARDS, payOnIyzico } from "./iyzico";
import { SONGS, VENUE_SLUG, beatPlayer, customerQueue, latestOrder, nowPlayingVideo, seedVenue, walletOf } from "./db";

// Müşterinin asıl yolu: QR ile gelen misafir hesap açmadan şarkıya dokunur,
// jetonu yetmediği için doğrudan ödemeye gider, dönüşte şarkı kendiliğinden
// sıraya girer (bkz. AddSongSheet.buyAndPlay + lib/pending-add.ts).

let venueId: string;

test.beforeEach(async () => {
  ({ venueId } = await seedVenue());
});

async function openAddSheet(page: import("@playwright/test").Page, songTitle: string) {
  await page.goto(`/venue/${VENUE_SLUG}`);
  // İlk girişte arama ekranı kendiliğinden açılır — şarkı oradan seçilir
  const search = page.getByRole("dialog", { name: "Şarkı Seç" });
  const row = search.locator("div").filter({ hasText: songTitle }).filter({ has: page.getByRole("button", { name: "Sıraya ekle" }) }).last();
  await row.getByRole("button", { name: "Sıraya ekle" }).click();
  await expect(page.getByText("Normal Sıra")).toBeVisible();
}

test("misafir şarkıya ödeme yapar, şarkı sıraya girer", async ({ page }) => {
  const song = SONGS[0];
  const startedAt = new Date();

  await openAddSheet(page, song.title);
  await expect(page.getByText("20₺").first()).toBeVisible();
  await beatPlayer(venueId);
  await page.getByText("Normal Sıra").click();

  await payOnIyzico(page, CARDS.success);

  // Dönüşte şarkının sayfasına gelinir ve şarkı sıraya eklenmiş olur
  await page.waitForURL(new RegExp(`/venue/${VENUE_SLUG}/song/${song.videoId}`), { timeout: 60_000 });

  const order = await latestOrder(venueId, startedAt);
  expect(order, "sipariş açılmalı").not.toBeNull();
  expect(order!.status).toBe("success");
  expect(order!.tokens).toBe(1);
  expect(Number(order!.total)).toBe(20);

  await expect
    .poll(async () => (await customerQueue(venueId)).map((q) => q.video_id), { timeout: 15_000 })
    .toContain(song.videoId);
  const queued = (await customerQueue(venueId)).find((q) => q.video_id === song.videoId)!;
  expect(queued.user_id).toBe(order!.user_id);
  expect(queued.priority).toBe(false);

  // Mekanda hiçbir şey çalmıyordu: müşterinin şarkısı hemen başlar. Bu iş
  // yanıttan sonra arka planda (after()) yapılıyor — bitmesini beklemek bir
  // sonraki testin temiz veritabanına sızmasını da önler.
  await expect.poll(() => nowPlayingVideo(venueId), { timeout: 20_000 }).toBe(song.videoId);

  // Alınan jeton şarkıya harcanır: +1 satın alma, -1 harcama, bakiye sıfır.
  // Ücretli jeton olarak işaretlenmeli — mekan hakedişi buradan hesaplanıyor.
  const wallet = await walletOf(order!.user_id);
  expect(wallet.balance).toBe(0);
  expect(wallet.transactions).toEqual([
    { kind: "purchase", amount: 1, paid_amount: 1 },
    { kind: "spend", amount: -1, paid_amount: 1 },
  ]);
});

test("reddedilen kartta jeton yüklenmez, şarkı sıraya girmez", async ({ page }) => {
  const song = SONGS[1];
  const startedAt = new Date();

  await openAddSheet(page, song.title);
  await beatPlayer(venueId);
  await page.getByText("Normal Sıra").click();

  await payOnIyzico(page, CARDS.insufficientFunds);

  // iyzico hatayı kendi formunda gösterir, siteye dönmez; müşteri başka kart deneyebilir
  await expect(page.getByText(/yetersiz|bakiye|reddedildi|başarısız/i).first()).toBeVisible({ timeout: 30_000 });
  expect(page.url()).toMatch(/sandbox-cpp\.iyzipay\.com/);

  const order = await latestOrder(venueId, startedAt);
  expect(order!.status).not.toBe("success");
  const wallet = await walletOf(order!.user_id);
  expect(wallet.balance).toBe(0);
  expect(wallet.transactions).toEqual([]);
  expect(await customerQueue(venueId)).toEqual([]);
});
