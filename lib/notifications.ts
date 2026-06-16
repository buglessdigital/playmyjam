// Bildirim tercihleri (cihaza özel) + tarayıcı Notification API yardımcıları

const PREF_KEYS = {
  nearby: "pmj_notif_nearby",
  queue: "pmj_notif_queue",
} as const;

export type NotifPref = keyof typeof PREF_KEYS;

const DEFAULTS: Record<NotifPref, boolean> = {
  nearby: true,
  queue: false,
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
