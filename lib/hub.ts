/**
 * Mekan sayfası ("hub") — plaketin arka yüzündeki QR'ın açtığı sayfa.
 *
 * Burada tür tanımları ve adres üretimi durur: hem mekan panelindeki düzenleme
 * ekranı hem de herkese açık sayfa AYNI kaynaktan okur. Bir türün etiketi ya da
 * adres kuralı değişecekse tek yer burasıdır.
 */

export const HUB_KINDS = [
  "menu",
  "instagram",
  "google_review",
  "wifi",
  "location",
  "phone",
  "whatsapp",
  "website",
  "reservation",
  "custom",
] as const;

export type HubKind = (typeof HUB_KINDS)[number];

export type HubLink = {
  id: string;
  kind: HubKind;
  label: string;
  value: string;
  note: string;
  enabled: boolean;
  position: number;
};

type KindMeta = {
  /** Satırın varsayılan başlığı — mekan kendi etiketini yazmazsa bu görünür */
  title: string;
  /** Panelde "değer" alanının ne beklediğini anlatan etiket */
  valueLabel: string;
  placeholder: string;
  /** Panelde alanın üstündeki tek satırlık yardım */
  hint: string;
  /** Sayfada satırın altında görünen küçük açıklama (mekan kendi notunu yazarsa o kazanır) */
  caption: string;
  /** wifi gibi bazı türlerde ek bir "etiket" alanı vardır (ağ adı) */
  labelField?: { label: string; placeholder: string };
};

export const HUB_KIND_META: Record<HubKind, KindMeta> = {
  menu: {
    title: "Menü",
    valueLabel: "Menü bağlantısı",
    placeholder: "https://...",
    hint: "Hazır QR menünüzün adresi ya da menü PDF'inizin bağlantısı.",
    caption: "Yiyecek ve içecekler",
  },
  instagram: {
    title: "Instagram",
    valueLabel: "Kullanıcı adı veya profil adresi",
    placeholder: "@mekanadi",
    hint: "Sadece kullanıcı adını yazmanız yeterli.",
    caption: "Son paylaşımlar",
  },
  google_review: {
    title: "Google'da değerlendir",
    valueLabel: "Google yorum bağlantısı",
    placeholder: "https://g.page/r/.../review",
    hint: "Google İşletme Profili > Yorum iste bölümündeki kısa bağlantıyı yapıştırın.",
    caption: "Bir dakikanızı alır",
  },
  wifi: {
    title: "Wi-Fi",
    valueLabel: "Şifre",
    placeholder: "Ağ şifresi",
    hint: "Şifre sayfada dokununca kopyalanır.",
    caption: "Dokunun, şifre kopyalansın",
    labelField: { label: "Ağ adı", placeholder: "Mekan_WiFi" },
  },
  location: {
    title: "Konum",
    valueLabel: "Harita bağlantısı",
    placeholder: "https://maps.app.goo.gl/...",
    hint: "Google Haritalar'da mekanınızı açıp Paylaş ile aldığınız bağlantı.",
    caption: "Yol tarifi al",
  },
  phone: {
    title: "Telefon",
    valueLabel: "Numara",
    placeholder: "0232 000 00 00",
    hint: "Dokununca telefon uygulaması açılır.",
    caption: "Bizi arayın",
  },
  whatsapp: {
    title: "WhatsApp",
    valueLabel: "Numara",
    placeholder: "0532 000 00 00",
    hint: "Ülke kodu olmadan yazabilirsiniz, başına otomatik 90 eklenir.",
    caption: "Yazışarak sorun",
  },
  website: {
    title: "Web sitesi",
    valueLabel: "Adres",
    placeholder: "https://...",
    hint: "Mekanınızın kendi sitesi.",
    caption: "",
  },
  reservation: {
    title: "Rezervasyon",
    valueLabel: "Rezervasyon bağlantısı",
    placeholder: "https://...",
    hint: "Rezervasyon formunuz ya da kullandığınız sistemin bağlantısı.",
    caption: "Masanızı ayırtın",
  },
  custom: {
    title: "Bağlantı",
    valueLabel: "Adres",
    placeholder: "https://...",
    hint: "Başlığı siz yazarsınız — etkinlik takvimi, çalma listesi, ne isterseniz.",
    caption: "",
  },
};

/** Panelde satırların çıkacağı sıra; mekan sürükleme yapmasa da makul bir düzen. */
export const HUB_KIND_ORDER: HubKind[] = [
  "menu",
  "wifi",
  "instagram",
  "google_review",
  "location",
  "phone",
  "whatsapp",
  "reservation",
  "website",
  "custom",
];

export function hubTitle(link: Pick<HubLink, "kind" | "label">): string {
  const custom = link.label.trim();
  if (custom) return custom;
  return HUB_KIND_META[link.kind].title;
}

/** Sayfada satırın altındaki küçük yazı. Mekan not yazdıysa o kazanır. */
export function hubCaption(link: Pick<HubLink, "kind" | "note">): string {
  const custom = link.note.trim();
  if (custom) return custom;
  return HUB_KIND_META[link.kind].caption;
}

/** Türkçe numaraları uluslararası biçime çevirir: 0532… → 90532… */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return `90${digits.slice(1)}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

/**
 * Satırın tıklanınca gideceği adres. Wi-Fi'nin adresi yoktur (kopyalanır),
 * bu yüzden null döner.
 */
export function hubHref(link: Pick<HubLink, "kind" | "value">): string | null {
  const value = link.value.trim();
  if (!value) return null;

  switch (link.kind) {
    case "wifi":
      return null;
    case "phone":
      return `tel:+${normalizePhone(value)}`;
    case "whatsapp":
      return `https://wa.me/${normalizePhone(value)}`;
    case "instagram": {
      if (/^https?:\/\//i.test(value)) return value;
      const handle = value.replace(/^@/, "").replace(/\/+$/, "");
      return `https://instagram.com/${handle}`;
    }
    default:
      return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }
}

/** Sayfada satırın sağında görünen kısa ipucu (adresin okunur hali). */
export function hubValueHint(link: Pick<HubLink, "kind" | "value">): string {
  const value = link.value.trim();
  if (!value) return "";
  if (link.kind === "instagram") return value.startsWith("@") ? value : `@${value.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "")}`;
  if (link.kind === "phone" || link.kind === "whatsapp") return value;
  return "";
}

/**
 * Kaydedilmeden önceki doğrulama. Hem panel hem route handler aynı kuralı
 * kullanır: arayüzde uyarı çıkar, sunucuda da aynı sebeple reddedilir.
 */
export function hubLinkError(link: Pick<HubLink, "kind" | "value" | "label">): string | null {
  const value = link.value.trim();
  if (!value) return "Bu alan boş bırakılamaz";
  if (value.length > 500) return "Adres çok uzun";

  if (link.kind === "phone" || link.kind === "whatsapp") {
    const digits = normalizePhone(value);
    if (digits.length < 10 || digits.length > 15) return "Numara geçerli görünmüyor";
    return null;
  }
  if (link.kind === "wifi") {
    if (!link.label.trim()) return "Ağ adını da yazın";
    return null;
  }
  if (link.kind === "custom" && !link.label.trim()) return "Bu satır için bir başlık yazın";
  if (link.kind === "instagram") return null;

  const href = hubHref(link);
  if (!href) return "Geçerli bir adres girin";
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "Adres http(s) olmalı";
  } catch {
    return "Geçerli bir adres girin";
  }
  return null;
}

/**
 * Plakete basılan adres: /<mekan-slug>/bilgi
 *
 * Slug DEĞİŞTİRİLEMEZ (super admin formunda da öyle yazıyor), bu yüzden basılı
 * plaket bozulmaz. Eskiden /m/<kod> kullanılıyordu; o adres hâlâ çalışıyor ama
 * buraya yönlendiriyor.
 */
export function hubPath(slug: string): string {
  return `/${slug}/bilgi`;
}

export function hubUrl(slug: string, origin = "https://playmyjam.com.tr"): string {
  return `${origin}${hubPath(slug)}`;
}

/**
 * Adresten gelen slug'ı sorguya sokmadan önce temizler. Slug'lar zaten yalnızca
 * harf, rakam ve tireden oluşuyor; uydurma bir değer boş dönsün ve sorgu hiç
 * yapılmasın.
 */
export function sanitizeVenueSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
}
