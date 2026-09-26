import { expect, test } from "@playwright/test";
import { SONGS, VENUE_SLUG, seedVenue, stopPlayer } from "./db";

// Mekanın oynatıcısı kapalıyken eklenen şarkı çalmaz, jeton boşa gider — bu
// yüzden ekleme düğmeleri "Kapalı" etiketine döner (bkz. lib/player-status.ts).

test("oynatıcı kapalıyken şarkı eklenemez", async ({ page }) => {
  const { venueId } = await seedVenue();
  await stopPlayer(venueId);

  await page.goto(`/venue/${VENUE_SLUG}`);
  const search = page.getByRole("dialog", { name: "Şarkı Seç" });
  await expect(search.getByText(SONGS[0].title)).toBeVisible();
  await expect(search.getByTitle("Mekanın oynatıcısı kapalı").first()).toBeVisible();
  await expect(search.getByRole("button", { name: "Sıraya ekle" })).toHaveCount(0);
});
