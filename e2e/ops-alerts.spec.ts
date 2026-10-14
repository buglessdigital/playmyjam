import { expect, test } from "@playwright/test";
import { adminCookie } from "./admin";
import { E2E_CRON_SECRET } from "./env";
import {
  VENUE_SLUG,
  cleanupSilence,
  createAbandonedOrder,
  ensureAdmin,
  issueKinds,
  orderState,
  pushKinds,
  seedVenue,
} from "./db";

// Sunucu tarafı emniyet ağları: müzik durunca mekana haber (lib/music-alert.ts)
// ve dönüşü gelmeyen ödemelerin mutabakatı (lib/payment-reconcile.ts).

let venueId: string;

test.beforeEach(async () => {
  ({ venueId } = await seedVenue());
});

test("açık player susunca mekana 'müzik durdu', ses dönünce 'yeniden çalıyor' gider", async ({ request }) => {
  const startedAt = new Date();
  const admin = await ensureAdmin(venueId);
  const cookie = adminCookie(admin, venueId, VENUE_SLUG);
  const silenceId = `e2e-${Date.now()}`;
  const beat = (events: unknown[]) =>
    request.post(`/api/player/${venueId}`, {
      headers: { Cookie: cookie },
      data: { action: "heartbeat", presence: true, events },
    });

  try {
    const start = {
      kind: "silence_start",
      severity: "error",
      message: "E2E: kontrol dışı sessizlik başladı",
      at: Date.now(),
      detail: { silence_id: silenceId, video_id: "dQw4w9WgXcQ", playing_frozen: false },
    };
    expect((await beat([start])).status()).toBe(200);
    // Yanıt kaybolunca player aynı olayı yeniden yollar — alarm yine bir kez
    expect((await beat([start])).status()).toBe(200);

    await expect.poll(() => issueKinds(venueId, startedAt), { timeout: 15_000 }).toContain("music_stopped");
    await expect.poll(() => pushKinds(venueId, startedAt), { timeout: 15_000 }).toContain("music_stopped");

    const end = {
      kind: "silence_end",
      severity: "error",
      message: "E2E: sessizlik bitti",
      at: Date.now(),
      detail: { silence_id: silenceId, seconds: 12, ended_by: "recovered" },
    };
    expect((await beat([end])).status()).toBe(200);
    await expect.poll(() => pushKinds(venueId, startedAt), { timeout: 15_000 }).toContain("music_resumed");

    const kinds = await pushKinds(venueId, startedAt);
    expect(kinds.filter((k) => k === "music_stopped")).toHaveLength(1);
    expect((await issueKinds(venueId, startedAt)).filter((k) => k === "music_stopped")).toHaveLength(1);
  } finally {
    await cleanupSilence(venueId, silenceId);
  }
});

test("dönüşü gelmeyen sipariş mutabakatla kapanır, yenisine dokunulmaz", async ({ request }) => {
  // Biri 2 saat önce açılıp bırakılmış, diğeri 5 dk önce açılmış (müşteri hâlâ formda olabilir)
  const abandoned = await createAbandonedOrder(venueId, 120);
  const fresh = await createAbandonedOrder(venueId, 5);

  const unauthorized = await request.get("/api/cron/payment-reconcile");
  expect(unauthorized.status()).toBe(401);

  const res = await request.get("/api/cron/payment-reconcile", {
    headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(res.status(), await res.text()).toBe(200);

  // iyzico sandbox'ta bu siparişin ödeme kaydı yok (5087) → yarıda bırakılmış
  const closed = await orderState(abandoned);
  expect(closed.status).toBe("failed");
  expect(closed.raw_response?.reconcile).toBe("abandoned");

  // 15 dakikadan genç sipariş bekletilir: callback hâlâ gelebilir
  expect((await orderState(fresh)).status).toBe("pending");
});
