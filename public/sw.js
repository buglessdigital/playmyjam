// PlayMyJam service worker
// Statik varlıkları cache'ler, sayfa gezinmelerinde ağ öncelikli çalışır,
// çevrimdışıyken offline sayfasına düşer. API/auth istekleri asla cache'lenmez.

// Marka varlıkları değişince yükselt: statik varlıklar cache öncelikli servis
// edildiği için, sürüm sabit kalırsa eski logo/ikonlar cihazlarda takılı kalır
// (activate eski sürümdeki tüm cache'leri siler).
const CACHE_VERSION = "pmj-v3";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Yalnızca aynı origin'den gelen GET istekleri; API ve auth hariç
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Sayfa gezinmeleri: ağ öncelikli, çevrimdışıysa offline sayfası
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())
      )
    );
    return;
  }

  // Statik varlıklar: cache öncelikli (stale-while-revalidate)
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      })
    );
  }
});

// Web push. Şarkı talebi bildirimlerinde yük ayrıca onay/ret düğmelerini
// (actions) ve imzalı kararı taşır — bkz. lib/request-approval.ts.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "PlayMyJam", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "PlayMyJam", {
      body: data.body ?? "",
      icon: data.icon ?? "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      requireInteraction: data.requireInteraction === true,
      // iOS Safari actions'ı desteklemez; orada bildirime dokunmak url'i açar
      // ve karar ekranı sayfada gösterilir (aynı sonuç, bir dokunuş fazla).
      actions: Array.isArray(data.actions) ? data.actions : undefined,
      data: { url: data.url ?? "/", ...(data.data ?? {}) },
    })
  );
});

// Talep bildirimindeki düğmeye basıldı: uygulamayı hiç açmadan karar ver.
async function decideRequest(action, payload) {
  try {
    const res = await fetch("/api/admin/requests/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action,
        token: payload.token,
        request_id: payload.requestId,
      }),
    });
    const body = await res.json().catch(() => null);

    if (res.ok) {
      await self.registration.showNotification(
        action === "approve" ? "Talep onaylandı" : "Talep reddedildi",
        {
          body:
            action === "approve"
              ? `${body?.title ?? "Şarkı"} müşteriye 10 dakikalığına açıldı.`
              : "Müşteriye bilgi verildi.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: payload.requestId ? `req-done-${payload.requestId}` : undefined,
        }
      );
      return;
    }

    await self.registration.showNotification("Karar işlenemedi", {
      body: body?.error ?? "Paneli açıp tekrar dene.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url ?? "/" },
    });
  } catch {
    await self.registration.showNotification("Bağlantı yok", {
      body: "Karar gönderilemedi, paneli açıp tekrar dene.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url ?? "/" },
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payload = event.notification.data ?? {};
  const targetUrl = payload.url ?? "/";

  if (event.action === "approve" || event.action === "reject") {
    event.waitUntil(decideRequest(event.action, payload));
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.focus();
        return existing.navigate(targetUrl);
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
