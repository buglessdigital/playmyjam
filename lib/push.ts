import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fcmConfigured, sendFcm } from "@/lib/fcm";

// Web Push gönderimi (VAPID). Anahtarlar yoksa sessizce devre dışı —
// push, uygulamanın kritik yolu değil; eksik env build'i/istekleri düşürmemeli.
//
// Müşteriye giden bildirimler mağaza uygulamasının cihazlarına da (FCM, 0077)
// AYNI gönderimde gider: tek push_deliveries satırı, cihaz sayısı ikisinin toplamı.

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
type NativeTokenRow = { id: string; token: string };

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
  shown_at?: string;
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
  delivery?: PushDelivery,
  native: NativeTokenRow[] = []
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

  const devices = subs.length + native.length;
  if (devices === 0) {
    await recordDelivery({ ...base, status: "no_device", devices: 0, error: null });
    return false;
  }

  // Satır gönderimden ÖNCE açılır: (1) service worker'ın "gösterildi" onayı
  // satırı hazır bulur, (2) fonksiyon yarıda kesilirse "tamamlanmadı" izi kalır
  await recordDelivery({
    ...base,
    status: "failed",
    devices,
    error: "gönderim tamamlanmadı (sunucu fonksiyonu yarıda kesildi)",
  });

  // deliveryId bildirimin data'sına iner → sw.js /api/push/ack ile işaretler
  const body = JSON.stringify({ ...payload, data: { ...(payload.data ?? {}), deliveryId: id } });
  let accepted = 0;
  let nativeAccepted = 0;
  let expired = 0;
  const errors: string[] = [];

  const nativeSends = native.map(async (row) => {
    const result = await sendFcm(row.token, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
      data: { deliveryId: id },
      ttlSeconds: delivery?.ttl ?? DEFAULT_TTL,
    });
    if (result.ok) {
      accepted++;
      nativeAccepted++;
    } else if (result.expired) {
      expired++;
      await supabaseAdmin.from("native_push_tokens").delete().eq("id", row.id);
    } else {
      errors.push(result.error);
    }
  });

  await Promise.all([
    ...nativeSends,
    ...subs.map(async (sub) => {
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
    }),
  ]);

  const failed = errors.length;
  // Bütün cihazların aboneliği düşmüşse alıcının fiilen cihazı yok
  const status: DeliveryStatus =
    accepted > 0 ? (failed > 0 ? "partial" : "sent") : failed > 0 ? "failed" : "no_device";
  await finishDelivery(id, {
    status,
    // Uygulama bildirimini işletim sistemi kendisi gösterir, sw.js'teki gibi
    // "göründü" onayı gelmez. Yalnızca uygulamaya gittiyse FCM'in kabulü en
    // yakın işaret — yoksa her uygulama bildirimi "onaysız" sayılırdı.
    ...(nativeAccepted > 0 && accepted === nativeAccepted ? { shown_at: new Date().toISOString() } : {}),
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
  const webReady = ensureVapid();
  const nativeReady = fcmConfigured();
  if (!webReady && !nativeReady) {
    await recordNotConfigured(payload, target);
    return;
  }

  const [web, native] = await Promise.all([
    webReady
      ? supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId)
      : Promise.resolve({ data: [] as SubscriptionRow[], error: null }),
    // iOS kodları APNs anahtarı gelene kadar yalnızca saklanıyor (0077)
    nativeReady
      ? supabaseAdmin.from("native_push_tokens").select("id, token").eq("user_id", userId).eq("platform", "android")
      : Promise.resolve({ data: [] as NativeTokenRow[], error: null }),
  ]);
  if (web.error) throw new Error(`push aboneliği okunamadı: ${web.error.message}`);
  // 0077 henüz uygulanmamışsa uygulama cihazları atlanır, web push etkilenmez
  if (native.error) console.error("[push] uygulama cihazları okunamadı:", native.error.message);

  await deliver(web.data ?? [], payload, target, delivery, native.error ? [] : (native.data ?? []));
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
