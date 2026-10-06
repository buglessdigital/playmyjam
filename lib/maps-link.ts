// Google Maps linkinden mekan koordinatı (bkz. 0073, Mekanlar haritası).
//
// Super admin mekanı Google Maps'te bulup "Paylaş → Bağlantıyı kopyala" ile
// gelen linki yapıştırır. Bu link çoğunlukla kısa (maps.app.goo.gl/…) ve
// koordinat içermez; yönlendirme zinciri izlenince uzun linke varılır:
//
//   …/maps/place/Mekan+Adı/@38.4237,27.1428,17z/data=…!3d38.42371!4d27.14283…
//
// "@lat,lng" haritanın O ANKİ merkezi, "!3d…!4d…" ise iğnenin kendisi —
// ikisi varsa iğne kazanır. Sayfa gövdesine BAKILMAZ: oradaki "center" ve
// başlangıç durumu Google'ın sunucu IP'sine göre seçtiği varsayılan merkez
// (denendi: Galata Kulesi linki İstanbul Havalimanı'nı verdi). Zincirde
// koordinat çıkmazsa super admin koordinatı elle yapıştırır.

export type Coords = { lat: number; lng: number };

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

function valid(lat: number, lng: number): Coords | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // 0,0 Gine Körfezi — Google'ın "konum yok" varsayılanı, gerçek mekan değil
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function pair(text: string | null | undefined): Coords | null {
  if (!text) return null;
  const m = text.trim().match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
  return m ? valid(Number(m[1]), Number(m[2])) : null;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Metinden (uzun link ya da düz "38.42, 27.14") koordinat.
 * Ağa çıkmaz; bulamazsa null.
 */
export function coordsFromText(raw: string): Coords | null {
  const text = safeDecode(raw.trim());

  // Elle yazılmış "enlem, boylam"
  const direct = pair(text);
  if (direct) return direct;

  // İğne: !3d<lat>!4d<lng> — bir linkte birden fazla olabilir, sonuncusu yer kartı
  const pins = [...text.matchAll(new RegExp(`!3d${NUM}!4d${NUM}`, "g"))];
  if (pins.length) {
    const last = pins[pins.length - 1];
    const c = valid(Number(last[1]), Number(last[2]));
    if (c) return c;
  }

  // Harita merkezi: /@<lat>,<lng>,<zoom>z
  const at = text.match(new RegExp(`@${NUM},${NUM}`));
  if (at) {
    const c = valid(Number(at[1]), Number(at[2]));
    if (c) return c;
  }

  // Sorgu parametreleri: ?q=lat,lng · ?query= · ?ll= · ?destination= · ?center=
  try {
    const url = new URL(text);
    for (const key of ["q", "query", "ll", "destination", "center", "daddr"]) {
      const c = pair(url.searchParams.get(key));
      if (c) return c;
    }
  } catch {
    // URL değil
  }

  return null;
}

// Yalnızca Google'ın harita alan adlarına gidilir: super admin'e açık bir uç
// olsa da sunucuyu keyfi adrese istek attırmanın (SSRF) yolu açık kalmasın.
const ALLOWED_HOST = /(^|\.)(google\.(?:com|com\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2})|goo\.gl|g\.co)$/i;

export function isAllowedMapsHost(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && ALLOWED_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

const MAX_HOPS = 6;
const TIMEOUT_MS = 5000;

const HEADERS = {
  // Tarayıcı kimliği GÖNDERİLMEZ: maps.app.goo.gl tarayıcıya 302 yerine JS'li ara
  // sayfa (200) döndürüyor, koordinatlı adrese hiç varılmıyor (denendi, 6 Eki 2026)
  "User-Agent": "PlayMyJam/1.0 (+https://playmyjam.com.tr)",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
  // Sunucu Frankfurt'ta (fra1): AB çerez onayı ekranına düşmesin
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

/**
 * Linkten koordinat — gerekirse kısa linkin yönlendirmelerini izler.
 * Bulamazsa null (super admin koordinatı elle girer).
 */
export async function resolveMapsLink(input: string): Promise<Coords | null> {
  const local = coordsFromText(input);
  if (local) return local;

  let href = input.trim();
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
  href = href.replace(/^http:/i, "https:");

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!isAllowedMapsHost(href)) return null;

    // Çerez onayı ekranı asıl adresi "continue" parametresinde taşır
    const url = new URL(href);
    if (url.hostname.startsWith("consent.")) {
      const next = url.searchParams.get("continue");
      if (!next) return null;
      href = next;
      const c = coordsFromText(href);
      if (c) return c;
      continue;
    }

    let res: Response;
    try {
      res = await fetch(href, {
        redirect: "manual",
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      return null;
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      href = new URL(location, href).toString();
      const c = coordsFromText(href);
      if (c) return c;
      continue;
    }

    // Zincirin sonu: koordinat taşımayan bir sayfaya varıldı
    await res.body?.cancel();
    return null;
  }

  return null;
}
