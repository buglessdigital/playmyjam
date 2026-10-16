// Super admin iş yönetimi: CRM aşamaları, hakediş hesabı ve dönem yardımcıları.
// İstemci ve sunucu ortak kullanır — sunucuya özel import YOK.

export const LEAD_STAGES = [
  "lead",
  "contacted",
  "meeting",
  "demo",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "on_hold",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_META: Record<LeadStage, { label: string; color: string }> = {
  lead: { label: "Aday", color: "#9ca3af" },
  contacted: { label: "İlk Temas", color: "#60a5fa" },
  meeting: { label: "Görüşme", color: "#8b5cf6" },
  demo: { label: "Demo", color: "#ec4899" },
  proposal: { label: "Teklif", color: "#f59e0b" },
  negotiation: { label: "Pazarlık", color: "#f97316" },
  won: { label: "Kazanıldı", color: "#22c55e" },
  lost: { label: "Kaybedildi", color: "#ef4444" },
  on_hold: { label: "Beklemede", color: "#6b7280" },
};

// Hattaki "açık" aşamalar — kazanılan/kaybedilen/bekleyen dışında kalanlar
export const OPEN_STAGES: LeadStage[] = ["lead", "contacted", "meeting", "demo", "proposal", "negotiation"];

export const LEAD_SOURCES = ["manual", "application", "referral", "field", "social", "event", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const SOURCE_LABEL: Record<LeadSource, string> = {
  manual: "Elle eklendi",
  application: "Web başvurusu",
  referral: "Tavsiye",
  field: "Saha ziyareti",
  social: "Sosyal medya",
  event: "Etkinlik / fuar",
  other: "Diğer",
};

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low: { label: "Düşük", color: "#6b7280" },
  normal: { label: "Normal", color: "#60a5fa" },
  high: { label: "Yüksek", color: "#ef4444" },
};

export const ACTIVITY_KINDS = ["call", "meeting", "visit", "whatsapp", "email", "demo", "note", "stage_change"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  call: "Telefon",
  meeting: "Toplantı",
  visit: "Ziyaret",
  whatsapp: "WhatsApp",
  email: "E-posta",
  demo: "Demo",
  note: "Not",
  stage_change: "Aşama değişti",
};

export const PAYOUT_STATUSES = ["draft", "approved", "paid", "cancelled"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export const PAYOUT_STATUS_META: Record<PayoutStatus, { label: string; color: string }> = {
  draft: { label: "Taslak", color: "#9ca3af" },
  approved: { label: "Onaylandı", color: "#f59e0b" },
  paid: { label: "Ödendi", color: "#22c55e" },
  cancelled: { label: "İptal", color: "#ef4444" },
};

// Hakediş kesinti oranları (app_settings.payout_settings)
export type PayoutSettings = {
  vat_rate: number; // KDV %, fiyata dahil
  bank_fee_pct: number; // banka / iyzico komisyonu %, iyzico cirosu (KDV dahil) üzerinden
  apple_fee_pct: number; // Apple (App Store) komisyonu %, Apple cirosunun KDV hariç kısmı üzerinden
  other_pct: number; // ek kesinti % (stopaj vb.), brüt ciro üzerinden
};

export const DEFAULT_PAYOUT_SETTINGS: PayoutSettings = { vat_rate: 20, bank_fee_pct: 0, apple_fee_pct: 0, other_pct: 0 };

export function parsePayoutSettings(raw: unknown): PayoutSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pct = (v: unknown, fallback: number) => {
    const n = Number(v);
    return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
  };
  return {
    vat_rate: pct(o.vat_rate, DEFAULT_PAYOUT_SETTINGS.vat_rate),
    bank_fee_pct: pct(o.bank_fee_pct, DEFAULT_PAYOUT_SETTINGS.bank_fee_pct),
    apple_fee_pct: pct(o.apple_fee_pct, DEFAULT_PAYOUT_SETTINGS.apple_fee_pct),
    other_pct: pct(o.other_pct, DEFAULT_PAYOUT_SETTINGS.other_pct),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Ücretli jetonun kanallara dağılımı: tokens tümü (Apple dahil), appleTokens Apple kısmı
export type PaidTokens = { tokens: number; appleTokens: number };
// Dönemin birim fiyatları; Apple fiyatı tanımlı değilse web fiyatı
export type UnitPrices = { web: number; apple: number };

// Hakediş = mekan komisyonu × (ciro − KDV − iyzico komisyonu − Apple komisyonu − ek kesinti)
// (Hizmet ve Gelir Paylaşım Sözleşmesi md. 5 — metin lib/contract-template.ts)
export function computePayout(paid: PaidTokens, prices: UnitPrices, s: PayoutSettings, commissionPct: number) {
  const appleTokens = Math.min(Math.max(paid.appleTokens, 0), paid.tokens);
  const webTokens = paid.tokens - appleTokens;
  const webGross = round2(webTokens * prices.web);
  const appleGross = round2(appleTokens * prices.apple);
  const gross = round2(webGross + appleGross);
  const vatOf = (g: number) => g - g / (1 + s.vat_rate / 100);
  const vat = round2(vatOf(gross));
  const bankFee = round2((webGross * s.bank_fee_pct) / 100);
  const appleFee = round2(((appleGross - vatOf(appleGross)) * s.apple_fee_pct) / 100);
  const other = round2((gross * s.other_pct) / 100);
  const net = Math.max(0, round2(gross - vat - bankFee - appleFee - other));
  const computed = round2((net * commissionPct) / 100);
  return { webTokens, appleTokens, webGross, appleGross, gross, vat, bankFee, appleFee, other, net, computed };
}

// ── Dönemler: "YYYY-MM" ay anahtarı, tarihler "YYYY-MM-DD" (İstanbul günü) ──

const pad = (n: number) => String(n).padStart(2, "0");

export function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

export function currentMonth(): string {
  return istanbulToday().slice(0, 7);
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` };
}

// Dönem kapandıktan sonraki ayın paymentDay'i
export function dueDateFor(month: string, paymentDay: number): string {
  return `${shiftMonth(month, 1)}-${pad(Math.min(Math.max(paymentDay, 1), 28))}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Biçimlendirme ──

export function formatTL(n: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "-";
  // "YYYY-MM-DD" gün değerini saat dilimi kaymadan göster
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

// Ödenmemiş ve vadesi geçmiş mi
export function isOverdue(status: PayoutStatus, dueDate: string, today = istanbulToday()): boolean {
  return (status === "draft" || status === "approved") && dueDate < today;
}

// <input type="datetime-local"> ↔ ISO. Panel İstanbul'da kullanılıyor; tarayıcı saatiyle çevirir.
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
