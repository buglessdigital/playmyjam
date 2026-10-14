import { expect, test } from "@playwright/test";
import { adminCookie } from "./admin";
import {
  POOL_SONG,
  VENUE_SLUG,
  beatPlayer,
  customerQueue,
  ensureAdmin,
  grantTokens,
  latestRequest,
  nowPlayingVideo,
  oneTimeGrant,
  pushKinds,
  seedPoolSong,
  seedVenue,
} from "./db";

// Listede olmayan şarkının yolu: müşteri aramada ortak havuzdaki şarkıyı
// "İste"r → mekana bildirim gider → mekan onaylar → müşteriye bildirim gider
// → şarkı 10 dakikalığına "Onaylanan Talepler"de açılır → müşteri jetonuyla
// sıraya ekler ve hak tükenir. Bkz. lib/request-approval.ts, app/api/discover.

let venueId: string;
let songId: string;

test.beforeEach(async () => {
  ({ venueId } = await seedVenue());
  songId = await seedPoolSong(venueId);
});

test("talep → mekan onayı → müşteri tek seferlik şarkıyı çaldırır", async ({ page }) => {
  const startedAt = new Date();

  // 1) Müşteri havuzdaki şarkıyı arar ve ister (ilk girişte arama kendiliğinden açılır)
  await page.goto(`/venue/${VENUE_SLUG}`);
  const search = page.getByRole("dialog", { name: "Şarkı Seç" });
  await search.getByPlaceholder("Şarkı veya sanatçı ara").fill("gangnam style");
  await expect(search.getByText("Mekanın listesinde yok")).toBeVisible({ timeout: 30_000 });
  // Havuz sonuçları dış katalogdan (Apple Music/Deezer) önce gelir: ilk "İste"
  // havuzdaki kayıt olmalı — dış katalogdaki cover'lar ("Apy" vb.) altta kalır.
  // Hangi satırın istendiğini aşağıda talep kaydının sanatçısı doğrular.
  const firstRequest = search.getByRole("button", { name: "İste", exact: true }).first();
  await firstRequest.click();
  await expect(page.getByText("Mekan onaylarsa sıraya ekleyebilirsin")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Anladım" }).click();

  const request = await latestRequest(venueId);
  expect(request, "talep kaydı açılmalı").not.toBeNull();
  expect(request!.status).toBe("pending");
  expect(request!.suggested_title).toBe(POOL_SONG.title);
  expect(request!.suggested_artist).toBe(POOL_SONG.artist);

  // Mekana "yeni talep" bildirimi tetiklenir (cihazı olmasa da teslim kaydı düşer)
  await expect.poll(() => pushKinds(venueId, startedAt), { timeout: 15_000 }).toContain("request_new");

  // 2) Mekan onaylar — şarkı havuzda olduğu için YouTube bağlantısı istenmez
  const admin = await ensureAdmin(venueId);
  const res = await page.request.post("/api/admin/requests/act", {
    headers: { Cookie: adminCookie(admin, venueId, VENUE_SLUG) },
    data: { action: "approve", request_id: request!.id },
  });
  expect(res.status(), await res.text()).toBe(200);

  expect((await latestRequest(venueId))!.status).toBe("accepted");
  expect(await oneTimeGrant(venueId, songId), "tek seferlik hak açılmalı").not.toBeNull();
  await expect.poll(() => pushKinds(venueId, startedAt), { timeout: 15_000 }).toContain("request_approved");

  // 3) Müşteri jetonuyla onaylanan şarkıyı sıraya ekler
  await grantTokens(request!.user_id, 1, venueId);
  await page.goto(`/venue/${VENUE_SLUG}`);
  const approved = page.locator("section").filter({ hasText: "Onaylanan Talepler" });
  await expect(approved.getByText(POOL_SONG.title)).toBeVisible({ timeout: 20_000 });
  await approved.getByRole("button", { name: "Sıraya ekle" }).first().click();
  await beatPlayer(venueId);
  await page.getByText("Normal Sıra").click();

  await expect
    .poll(async () => (await customerQueue(venueId)).map((q) => q.video_id), { timeout: 15_000 })
    .toContain(POOL_SONG.videoId);
  // Mekanda hiçbir şey çalmıyordu: şarkı hemen başlar. Bu iş yanıttan sonra
  // arka planda (after()) yapılıyor — beklenmezse bir sonraki testin temiz
  // veritabanına sızıp onun "çalan şarkı" kontrolünü bozuyor.
  await expect.poll(() => nowPlayingVideo(venueId), { timeout: 20_000 }).toBe(POOL_SONG.videoId);

  // Hak tek kullanımlık: ekleyen müşteriyle tüketilir
  await expect.poll(async () => (await oneTimeGrant(venueId, songId))?.consumed_at ?? null, { timeout: 10_000 }).not.toBeNull();
});
