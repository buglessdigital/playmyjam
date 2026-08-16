export interface SuggestionInput {
  suggested_title: string;
  suggested_artist: string;
  /** Dış katalogdan seçildiyse kapak görseli — yalnızca bildirimin ikonu olur */
  suggested_cover_url?: string;
}

// Serbest metin öneri: müşteri mekan listesinde bulamadığı şarkıyı elle yazar.
// Metin admin panelinde ham gösterildiği için sınırlar dar tutulur.
const SUGGESTION_MAX = 120;

// Kapak URL'i mekanın cihazında AÇILIR (bildirim ikonu). Serbest URL kabul
// edilirse müşteri, adminin IP'sini toplayan bir piksel yerleştirebilir —
// bu yüzden yalnızca dış katalog aramasının kendi CDN'leri geçerli.
// (bkz. lib/discover.ts: iTunes → mzstatic, Deezer → dzcdn)
const COVER_HOSTS = /^[a-z0-9-]+\.(mzstatic\.com|dzcdn\.net)$/;

function cleanCoverUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 300) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (!COVER_HOSTS.test(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseSuggestionInput(
  body: unknown
): { ok: true; suggestion: SuggestionInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek" };
  }
  const b = body as Record<string, unknown>;

  // Kontrol karakterleri ve tekrarlı boşluk temizlenir
  const clean = (v: unknown) =>
    typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";

  const suggested_title = clean(b.suggested_title);
  if (!suggested_title || suggested_title.length > SUGGESTION_MAX) {
    return { ok: false, error: `Şarkı adı gerekli (en fazla ${SUGGESTION_MAX} karakter)` };
  }

  const suggested_artist = clean(b.suggested_artist);
  if (!suggested_artist || suggested_artist.length > SUGGESTION_MAX) {
    return { ok: false, error: `Sanatçı adı gerekli (en fazla ${SUGGESTION_MAX} karakter)` };
  }

  // Geçersiz/yabancı kapak isteği düşürmez, sessizce elenir: talep asıl iş
  return {
    ok: true,
    suggestion: { suggested_title, suggested_artist, suggested_cover_url: cleanCoverUrl(b.suggested_cover_url) },
  };
}

export interface SongInput {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
}

// YouTube video kimliği 11 karakterdir (base64url alfabesi)
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseSongInput(
  body: unknown
): { ok: true; song: SongInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek" };
  }
  const b = body as Record<string, unknown>;

  const youtube_video_id = typeof b.youtube_video_id === "string" ? b.youtube_video_id.trim() : "";
  if (!VIDEO_ID_RE.test(youtube_video_id)) {
    return { ok: false, error: "Geçersiz YouTube video kimliği" };
  }

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > 300) {
    return { ok: false, error: "Şarkı adı gerekli (en fazla 300 karakter)" };
  }

  const artist = typeof b.artist === "string" ? b.artist.trim() : "";
  if (!artist || artist.length > 300) {
    return { ok: false, error: "Sanatçı adı gerekli (en fazla 300 karakter)" };
  }

  const album_cover_url = typeof b.album_cover_url === "string" ? b.album_cover_url.trim() : "";
  if (album_cover_url && (album_cover_url.length > 600 || !album_cover_url.startsWith("https://"))) {
    return { ok: false, error: "Geçersiz kapak görseli adresi" };
  }

  const duration_ms = typeof b.duration_ms === "number" ? Math.floor(b.duration_ms) : NaN;
  if (!Number.isFinite(duration_ms) || duration_ms < 1000 || duration_ms > 3_600_000) {
    return { ok: false, error: "Geçersiz şarkı süresi" };
  }

  return { ok: true, song: { youtube_video_id, title, artist, album_cover_url, duration_ms } };
}

export interface VenueApplicationInput {
  venue_name: string;
  contact_name: string;
  phone: string;
  email: string;
  city: string;
  venue_type: string;
  message: string;
}

// Vitrin sayfasındaki mekan kayıt formu. Alanlar super admin panelinde ham
// gösterildiği için uzunluklar dar tutulur; mesaj kutusu tek istisna.
const APPLICATION_MAX = 120;
const MESSAGE_MAX = 1000;

// Telefon serbest yazılıyor (0532..., +90 532..., boşluklu/tireli) — biçimi
// zorlamak yerine yalnızca rakam sayısına bakılır, gerisi temizlenip saklanır.
const PHONE_ALLOWED_RE = /^[0-9+()\-.\s]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// Formdaki seçim kutusunun değerleri; dışarıdan gelen başka bir şey boşa düşer
export const VENUE_TYPES = [
  "Kafe",
  "Restoran",
  "Bar / Pub",
  "Gece Kulübü",
  "Otel",
  "Diğer",
] as const;

export function parseVenueApplicationInput(
  body: unknown
): { ok: true; application: VenueApplicationInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek" };
  }
  const b = body as Record<string, unknown>;

  // Kontrol karakterleri ve tekrarlı boşluk temizlenir
  const clean = (v: unknown) =>
    typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";

  const venue_name = clean(b.venue_name);
  if (!venue_name || venue_name.length > APPLICATION_MAX) {
    return { ok: false, error: `Mekan adı gerekli (en fazla ${APPLICATION_MAX} karakter)` };
  }

  const contact_name = clean(b.contact_name);
  if (!contact_name || contact_name.length > APPLICATION_MAX) {
    return { ok: false, error: `Yetkili adı gerekli (en fazla ${APPLICATION_MAX} karakter)` };
  }

  const phone = clean(b.phone);
  const phoneDigits = phone.replace(/\D/g, "");
  if (!phone || !PHONE_ALLOWED_RE.test(phone) || phoneDigits.length < 10 || phoneDigits.length > 15) {
    return { ok: false, error: "Geçerli bir telefon numarası girin" };
  }

  const email = clean(b.email).toLowerCase();
  if (!email || email.length > APPLICATION_MAX || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Geçerli bir e-posta adresi girin" };
  }

  const city = clean(b.city);
  if (city.length > APPLICATION_MAX) {
    return { ok: false, error: `Şehir en fazla ${APPLICATION_MAX} karakter olabilir` };
  }

  // Listede olmayan bir tür gelirse sessizce boşalt — panelde uydurma etiket çıkmasın
  const rawType = clean(b.venue_type);
  const venue_type = (VENUE_TYPES as readonly string[]).includes(rawType) ? rawType : "";

  // Mesajda satır sonları korunur; yalnızca diğer kontrol karakterleri düşer
  const message =
    typeof b.message === "string"
      ? b.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim()
      : "";
  if (message.length > MESSAGE_MAX) {
    return { ok: false, error: `Mesaj en fazla ${MESSAGE_MAX} karakter olabilir` };
  }

  return { ok: true, application: { venue_name, contact_name, phone, email, city, venue_type, message } };
}
