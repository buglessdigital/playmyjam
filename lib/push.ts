import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Web Push gönderimi (VAPID). Anahtarlar yoksa sessizce devre dışı —
// push, uygulamanın kritik yolu değil; eksik env build'i/istekleri düşürmemeli.

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@playmyjam.app",
    publicKey,
    privateKey
  );
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  /**
   * Bildirim üstündeki düğmeler (Android/masaüstü). iOS Safari bu alanı yok
   * sayar — orada bildirime dokunmak `url`'i açar, karar oradan verilir.
   */
  actions?: { action: string; title: string }[];
  /** Service worker'ın düğmelere basılınca kullanacağı veri (ör. onay jetonu) */
  data?: Record<string, unknown>;
  /** Aynı tag'li eski bildirimin üstüne yazar — talep listesi bildirimle şişmesin */
  tag?: string;
  /** Kullanıcı karar verene kadar ekranda kalsın (yalnızca masaüstü/Android) */
  requireInteraction?: boolean;
}

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

async function deliver(subs: SubscriptionRow[], payload: PushPayload): Promise<void> {
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );
}

// Kullanıcının tüm cihazlarına gönderir; süresi dolmuş abonelikleri (404/410) temizler.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  await deliver(subs, payload);
}

// Mekanın tüm adminlerinin cihazlarına gönderir (0045: admin_id'li abonelikler).
// Aynı mekanda birden çok admin olabilir — hepsi haberdar olur, ilk karar veren
// kazanır (sunucu talebin hâlâ 'pending' olduğunu doğruluyor).
export async function sendPushToVenueAdmins(venueId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;

  const { data: admins } = await supabaseAdmin
    .from("venue_admins")
    .select("id")
    .eq("venue_id", venueId);
  const adminIds = (admins ?? []).map((a) => a.id as string);
  if (adminIds.length === 0) return;

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("admin_id", adminIds);
  if (!subs || subs.length === 0) return;

  await deliver(subs, payload);
}
