"use client";

/**
 * Müşteri paneli arayüz analizi (0058 ui_events). Super admin'in "Arayüz
 * analizi" ekranı buradan beslenir.
 *
 * Anonim: kimlik, IP ya da yazılan metin gönderilmez. Oturum kimliği sekme
 * başına rastgeledir, 30 dk hareketsizlikte yenilenir. Olaylar biriktirilip
 * toplu gönderilir; sayfa kapanırken sendBeacon ile boşaltılır.
 *
 * Tıklanan öğenin adı: en yakın [data-track] > aria-label > title > görünen
 * metin. Adı değişken öğeler (şarkı satırları gibi) "sel" imzasıyla (etiket
 * yolu) ekranda birleştirilebilir.
 */

type UiEvent = {
  t: number;
  k: "view" | "click" | "action";
  p: string;
  tg?: string;
  s?: string;
  d?: 1;
  r?: 1;
  x?: number;
  vy?: number;
  py?: number;
  m?: Record<string, unknown>;
};

const ENDPOINT = "/api/ui-events";
const FLUSH_MS = 10_000;
const MAX_QUEUE = 40;
const SESSION_IDLE_MS = 30 * 60_000;
const SID_KEY = "pmj-ui-sid";
// Öfke tıklaması: 1 sn içinde 30 px çevresinde 3. tıklama ve sonrası
const RAGE_WINDOW_MS = 1_000;
const RAGE_RADIUS = 30;
const RAGE_COUNT = 3;

const INTERACTIVE =
  "a,button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=option],[role=menuitem],[role=slider],[tabindex]:not([tabindex='-1']),[data-track]";

let queue: UiEvent[] = [];
let slug = "";
let page = "";
let timer: ReturnType<typeof setTimeout> | null = null;
let recentClicks: { t: number; x: number; y: number }[] = [];
let firstView = true;

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  // Super admin ısı haritası paneli sayfayı iframe'de gösterir: o görüntüleme sayılmaz
  if (window.top !== window.self) return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    try {
      return localStorage.getItem("pmj-ui-track-dev") === "1";
    } catch {
      return false;
    }
  }
  return true;
}

function sessionId(): string {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(SID_KEY);
    if (raw) {
      const [id, last] = raw.split("|");
      if (id && now - Number(last) < SESSION_IDLE_MS) {
        sessionStorage.setItem(SID_KEY, `${id}|${now}`);
        return id;
      }
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem(SID_KEY, `${id}|${now}`);
    firstView = true;
    return id;
  } catch {
    // Depolama kapalıysa sayfa ömrü boyunca tek oturum
    const w = window as unknown as { __pmjUiSid?: string };
    w.__pmjUiSid ??= crypto.randomUUID();
    return w.__pmjUiSid;
  }
}

/** /venue/<slug>/song/abc?x=1 → /song/:id  (ekranda sayfa başına toplanabilsin) */
export function normalizePage(pathname: string, venueSlug: string): string {
  let p = pathname.startsWith(`/venue/${venueSlug}`) ? pathname.slice(`/venue/${venueSlug}`.length) : pathname;
  const segs = p.split("/").filter(Boolean);
  const out = segs.map((s, i) => {
    if (i > 0 && (segs[i - 1] === "song" || (/\d/.test(s) && s.length >= 8))) return ":id";
    return s;
  });
  p = "/" + out.join("/");
  return p.slice(0, 80);
}

function push(e: UiEvent) {
  if (!slug) return;
  queue.push(e);
  if (queue.length >= MAX_QUEUE) flush(false);
  else if (!timer) timer = setTimeout(() => flush(false), FLUSH_MS);
}

export function flush(beacon: boolean) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0 || !slug) return;
  const body = JSON.stringify({ venue: slug, sid: sessionId(), events: queue });
  queue = [];
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

// Tıklanamayan yere dokunuşta kabın bütün metni değil, yalnızca öğenin kendi
// yazısı (doğrudan metin düğümleri) ad olur
function ownText(el: Element): string {
  let out = "";
  for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
  return out.replace(/\s+/g, " ").trim().slice(0, 60);
}

function labelOf(el: Element, interactive: boolean): string {
  const tracked = el.closest<HTMLElement>("[data-track]");
  if (tracked?.dataset.track) return tracked.dataset.track;
  const aria = el.getAttribute("aria-label") || el.getAttribute("title");
  if (aria) return aria.trim().slice(0, 60);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // Yazılan değer ASLA gönderilmez
    return `[${el.type || "text"}] ${el.placeholder || el.name || ""}`.trim().slice(0, 60);
  }
  if (el instanceof HTMLSelectElement) return `[seçim] ${el.name || ""}`.trim();
  if (!interactive) {
    const own = ownText(el);
    return own ? `(boş alan) ${own}` : `(boş alan · ${el.tagName.toLowerCase()})`;
  }
  const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 60);
  if (el.querySelector("svg, img")) return `(${el.tagName.toLowerCase()} · ikon)`;
  return `(${el.tagName.toLowerCase()})`;
}

// Yapısal imza: aynı kalıptan üretilen öğeler (şarkı satırları) aynı imzayı taşır
function selectorOf(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; cur && i < 5 && cur !== document.body; i++) {
    const tag = cur.tagName.toLowerCase();
    if (tag === "main") break;
    const role = cur.getAttribute("role");
    parts.unshift(role ? `${tag}[${role}]` : tag);
    cur = cur.parentElement;
  }
  return parts.join(">").slice(0, 120);
}

function looksClickable(el: Element | null): boolean {
  for (let i = 0; el && i < 4; i++, el = el.parentElement) {
    if (getComputedStyle(el).cursor === "pointer") return true;
  }
  return false;
}

function onClick(ev: MouseEvent) {
  const target = ev.target instanceof Element ? ev.target : null;
  if (!target || !page) return;
  const interactive = target.closest(INTERACTIVE);
  const el = interactive ?? target;
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  // Klavyeyle tetiklenen tıklamanın koordinatı yok (0,0)
  const hasPoint = ev.clientX > 0 || ev.clientY > 0;

  const now = Date.now();
  recentClicks = recentClicks.filter((c) => now - c.t < RAGE_WINDOW_MS);
  recentClicks.push({ t: now, x: ev.clientX, y: ev.clientY });
  const near = recentClicks.filter(
    (c) => Math.abs(c.x - ev.clientX) < RAGE_RADIUS && Math.abs(c.y - ev.clientY) < RAGE_RADIUS
  ).length;

  push({
    t: now,
    k: "click",
    p: page,
    tg: labelOf(el, !!interactive || looksClickable(target)),
    s: selectorOf(el),
    ...(interactive || looksClickable(target) ? {} : { d: 1 as const }),
    ...(near >= RAGE_COUNT ? { r: 1 as const } : {}),
    ...(hasPoint
      ? {
          x: Math.round((ev.clientX / w) * 1000),
          vy: Math.round((ev.clientY / h) * 1000),
          py: Math.round(ev.clientY + window.scrollY),
        }
      : {}),
  });
}

function onHide() {
  if (document.visibilityState === "hidden") flush(true);
}

/** Panel kabuğu kurar; slug değişince (başka mekan) yeniden kurulur. */
export function startUiTracking(venueSlug: string): () => void {
  if (!enabled()) return () => {};
  slug = venueSlug;
  document.addEventListener("click", onClick, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
  return () => {
    flush(true);
    document.removeEventListener("click", onClick, { capture: true });
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    slug = "";
    page = "";
  };
}

export function trackView(pathname: string) {
  if (!slug) return;
  page = normalizePage(pathname, slug);
  sessionId(); // oturum süresini tazele (yeni oturumsa firstView açılır)
  const m: Record<string, unknown> = { path: pathname.slice(0, 200) };
  if (firstView) {
    firstView = false;
    const params = new URLSearchParams(window.location.search);
    m.w = window.innerWidth;
    m.h = window.innerHeight;
    m.pwa = window.matchMedia?.("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    m.lang = document.documentElement.lang || "tr";
    const src = params.get("src") || params.get("utm_source");
    if (src) m.src = src.slice(0, 40);
    try {
      if (document.referrer) m.ref = new URL(document.referrer).hostname.slice(0, 60);
    } catch {}
  }
  push({ t: Date.now(), k: "view", p: page, m });
}

/** Sonuç olayı: song_added | song_requested | suggestion_sent | checkout_started */
export function trackAction(name: string, meta?: Record<string, unknown>) {
  if (!slug || !page) return;
  push({ t: Date.now(), k: "action", p: page, tg: name, ...(meta ? { m: meta } : {}) });
  // Ödeme sayfasına yönlenmeden hemen önce çağrılabilir: beklemeden gönder
  if (name === "checkout_started") flush(true);
}
