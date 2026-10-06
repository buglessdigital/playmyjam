import { expect, test } from "@playwright/test";
import { SONGS, VENUE_SLUG, beatPlayer, queueSongDirectly, seedVenue, stopPlayer } from "./db";

// Müşteri ekranları mekanın canlı hattını dinler (lib/venue-live.ts ←
// 0060 tetikleyicileri). Değişiklik başka bir yerden yapılır ve ekranın
// YENİDEN YÜKLENMEDEN güncellendiği doğrulanır.

test("başka müşterinin eklediği şarkı sıra ekranına kendiliğinden düşer", async ({ page }) => {
  const { venueId } = await seedVenue();

  await page.goto(`/venue/${VENUE_SLUG}/queue`);
  await expect(page.getByText("Kuyruk boş — ilk şarkıyı sen ekle!")).toBeVisible();

  await queueSongDirectly(venueId, SONGS[1].videoId);
  await expect(page.getByText(SONGS[1].title)).toBeVisible();
  await expect(page.getByText("Kuyruk boş — ilk şarkıyı sen ekle!")).toHaveCount(0);
});

test("oynatıcı açılınca ekleme kilidi yeniden yüklemeden kalkar", async ({ page }) => {
  const { venueId } = await seedVenue();
  await stopPlayer(venueId);

  await page.goto(`/venue/${VENUE_SLUG}`);
  const search = page.getByRole("dialog", { name: "Şarkı Seç" });
  await expect(search.getByTitle("Mekanın oynatıcısı kapalı").first()).toBeVisible();

  // Kapalı player'ın ilk heartbeat'i `beat` mesajı üretir (0060)
  await beatPlayer(venueId);
  await expect(search.getByTitle("Mekanın oynatıcısı kapalı")).toHaveCount(0);
  await expect(search.getByRole("button", { name: "Sıraya ekle" }).first()).toBeVisible();
});
