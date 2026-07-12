// Bildirim tercihleri (cihaza özel) + tarayıcı Notification API yardımcıları

const PREF_KEYS = {
  nearby: "pmj_notif_nearby",
  queue: "pmj_notif_queue",
  push: "pmj_notif_push",
} as const;

export type NotifPref = keyof typeof PREF_KEYS;

const DEFAULTS: Record<NotifPref, boolean> = {
  nearby: true,
  queue: false,
  push: false,
};

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotifPref(pref: NotifPref): boolean {
  if (typeof window === "undefined") return DEFAULTS[pref];
  const raw = localStorage.getItem(PREF_KEYS[pref]);
  return raw === null ? DEFAULTS[pref] : raw === "1";
}

export function setNotifPref(pref: NotifPref, value: boolean) {
  localStorage.setItem(PREF_KEYS[pref], value ? "1" : "0");
  // Aynı sekmedeki dinleyiciler (NotificationWatcher) tercihi anında alsın
  window.dispatchEvent(new CustomEvent("pmj-notif-pref-changed", { detail: { pref, value } }));
}

export function getPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function notify(title: string, body?: string, icon?: string) {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon, badge: icon, tag: `pmj-${title}` });
  } catch {
    // Bazı mobil tarayıcılar sayfa içinden new Notification'a izin vermez; sessizce geç
  }
}

// ---- Web Push aboneliği (uygulama kapalıyken de bildirim) ----

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// İzin ister, push aboneliği oluşturur ve sunucuya kaydeder.
// true = abonelik aktif; false = izin reddedildi / desteklenmiyor / kayıt başarısız.
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if ((await requestPermission()) !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      }));

    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Cihazdaki push aboneliğini kaldırır ve sunucudaki kaydı siler.
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/notifications/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  } catch {
    // Abonelik kaldırılamazsa bir dahaki açılışta tekrar denenir; kritik değil
  }
}
