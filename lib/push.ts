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

// web-push varsayılanı "normal" aciliyet + 4 hafta TTL. Android normal öncelikli
// mesajı ekran kapalıyken (Doze) biriktirip dakikalar sonra teslim ediyor —
// 10 dakikalık karar penceresi olan talep bildirimi admine geç düşüyordu.
// Bildirimlerimizin hepsi kullanıcıya görünür ve zamana bağlı: hepsi "high".
export interface PushDelivery {
  /** Saniye. Cihaz bu sürede çevrimiçi olmazsa bildirim hiç gösterilmez. */
  ttl?: number;
}

const DEFAULT_TTL = 60 * 60 * 24;

function sendOptions(delivery?: PushDelivery) {
  return { urgency: "high" as const, TTL: delivery?.ttl ?? DEFAULT_TTL };
}

type SubscriptionRow = { id?: string; endpoint: string; p256dh: string; auth: string };

// Teslim kaydı (0061 push_deliveries): super admin "Sorunlar" ekranı her
// bildirimin akıbetini buradan görür. Eskiden hatalar ve "cihazı yok"
// durumları iz bırakmadan yutuluyordu.
export type PushKind =
  | "song_playing"
  | "request_new"
  | "request_approved"
  | "request_rejected"
  | "suggestion_added"
  | "subscribe_test";

export interface PushLog {
  kind: PushKind;
  venueId?: string | null;
}

type Audience = "customer" | "admin";
type DeliveryStatus = "sent" | "partial" | "failed" | "no_device" | "not_configured";

type DeliveryRow = {
  id: string;
  venue_id: string | null;
  kind: PushKind;
  audience: Audience;
  recipient_id: string | null;
  status: DeliveryStatus;
  devices: number;
  accepted?: number;
  expired?: number;
  failed?: number;
  error: string | null;
  title: string;
};

// Kayıt ASLA gönderimi düşürmemeli
async function recordDelivery(row: DeliveryRow): Promise<void> {
  const { error } = await supabaseAdmin.from("push_deliveries").insert(row);
  if (error) console.error("[push] teslim kaydı yazılamadı:", error.message);
}

async function finishDelivery(id: string, patch: Partial<DeliveryRow>): Promise<void> {
  const { error } = await supabaseAdmin.from("push_deliveries").update(patch).eq("id", id);
  if (error) console.error("[push] teslim kaydı güncellenemedi:", error.message);
}

// Push servisinin (FCM / Apple / Mozilla) sık dönen kodları → ekranda okunur neden
function pushStatusHint(status: number): string {
  if (status === 400 || status === 403) return "push servisi isteği reddetti (VAPID anahtarı abonelikle uyuşmuyor olabilir)";
  if (status === 413) return "bildirim içeriği çok büyük";
  if (status === 429) return "push servisi hız sınırına takıldı";
  if (status >= 500) return "push servisi geçici hata verdi";
  return "push servisi reddetti";
}

function pushErrorText(err: unknown): string {
  const e = err as { statusCode?: number; body?: unknown; message?: string };
  const body = typeof e.body === "string" ? e.body.trim().slice(0, 160) : "";
  if (e.statusCode) return `${e.statusCode} ${pushStatusHint(e.statusCode)}${body ? `: ${body}` : ""}`;
  // Ağ hatası: sunucu push servisine hiç ulaşamadı
  return `push servisine ulaşılamadı: ${(e.message ?? String(err)).slice(0, 160)}`;
}

async function deliver(
  subs: SubscriptionRow[],
  payload: PushPayload,
  target: { audience: Audience; recipientId: string | null; log: PushLog },
  delivery?: PushDelivery
): Promise<boolean> {
  const id = crypto.randomUUID();
  const base = {
    id,
    venue_id: target.log.venueId ?? null,
    kind: target.log.kind,
    audience: target.audience,
    recipient_id: target.recipientId,
    title: payload.title.slice(0, 120),
  };

  if (subs.length === 0) {
    await recordDelivery({ ...base, status: "no_device", devices: 0, error: null });
    return false;
  }

  // Satır gönderimden ÖNCE açılır: (1) service worker'ın "gösterildi" onayı
  // satırı hazır bulur, (2) fonksiyon yarıda kesilirse "tamamlanmadı" izi kalır
  await recordDelivery({
    ...base,
    status: "failed",
    devices: subs.length,
    error: "gönderim tamamlanmadı (sunucu fonksiyonu yarıda kesildi)",
  });

  // deliveryId bildirimin data'sına iner → sw.js /api/push/ack ile işaretler
  const body = JSON.stringify({ ...payload, data: { ...(payload.data ?? {}), deliveryId: id } });
  let accepted = 0;
  let expired = 0;
  const errors: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          sendOptions(delivery)
        );
        accepted++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          expired++;
          if (sub.id) await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          errors.push(pushErrorText(err));
        }
      }
    })
  );

  const failed = errors.length;
  // Bütün cihazların aboneliği düşmüşse alıcının fiilen cihazı yok
  const status: DeliveryStatus =
    accepted > 0 ? (failed > 0 ? "partial" : "sent") : failed > 0 ? "failed" : "no_device";
  await finishDelivery(id, {
    status,
    accepted,
    expired,
    failed,
    error:
      errors.length > 0
        ? [...new Set(errors)].join(" | ").slice(0, 500)
        : expired > 0 && accepted === 0
          ? "cihaz aboneliği süresi dolmuş (izin kaldırılmış ya da uygulama silinmiş)"
          : null,
  });
  return accepted > 0;
}

async function recordNotConfigured(
  payload: PushPayload,
  target: { audience: Audience; recipientId: string | null; log: PushLog }
): Promise<void> {
  await recordDelivery({
    id: crypto.randomUUID(),
    venue_id: target.log.venueId ?? null,
    kind: target.log.kind,
    audience: target.audience,
    recipient_id: target.recipientId,
    status: "not_configured",
    devices: 0,
    error: "VAPID anahtarları sunucuda tanımlı değil",
    title: payload.title.slice(0, 120),
  });
}

// Tek bir cihaza gönderir. Abonelik yeni kaydedildiğinde "bildirimler açıldı"
// doğrulaması için kullanılır: kullanıcı düğmeye bastıktan sonra bildirimin
// gerçekten düştüğünü GÖRÜR, aylar sonra "acaba çalışıyor mu" diye kalmaz.
export async function sendPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  owner: { audience: Audience; recipientId: string; venueId?: string | null }
): Promise<boolean> {
  const target = {
    audience: owner.audience,
    recipientId: owner.recipientId,
    log: { kind: "subscribe_test" as const, venueId: owner.venueId },
  };
  if (!ensureVapid()) {
    await recordNotConfigured(payload, target);
    return false;
  }
  return deliver([sub], payload, target);
}

// Kullanıcının tüm cihazlarına gönderir; süresi dolmuş abonelikleri (404/410) temizler.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  log: PushLog,
  delivery?: PushDelivery
): Promise<void> {
  const target = { audience: "customer" as const, recipientId: userId, log };
  if (!ensureVapid()) {
    await recordNotConfigured(payload, target);
    return;
  }

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw new Error(`push aboneliği okunamadı: ${error.message}`);

  await deliver(subs ?? [], payload, target, delivery);
}

// Mekanın tüm adminlerinin cihazlarına gönderir (0045: admin_id'li abonelikler).
// Aynı mekanda birden çok admin olabilir — hepsi haberdar olur, ilk karar veren
// kazanır (sunucu talebin hâlâ 'pending' olduğunu doğruluyor).
export async function sendPushToVenueAdmins(
  venueId: string,
  payload: PushPayload,
  log: Omit<PushLog, "venueId">,
  delivery?: PushDelivery
): Promise<void> {
  const target = { audience: "admin" as const, recipientId: null, log: { ...log, venueId } };
  if (!ensureVapid()) {
    await recordNotConfigured(payload, target);
    return;
  }

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from("venue_admins")
    .select("id")
    .eq("venue_id", venueId);
  if (adminsError) throw new Error(`mekan adminleri okunamadı: ${adminsError.message}`);
  const adminIds = (admins ?? []).map((a) => a.id as string);

  const { data: subs, error } =
    adminIds.length > 0
      ? await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .in("admin_id", adminIds)
      : { data: [], error: null };
  if (error) throw new Error(`push aboneliği okunamadı: ${error.message}`);

  await deliver(subs ?? [], payload, target, delivery);
}
