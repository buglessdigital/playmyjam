import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  PRIORITIES,
  parsePayoutSettings,
  type PayoutSettings,
} from "@/lib/business";

// Serbest metin alanı: string değilse ya da sınırı aşarsa null (→ 400)
export function text(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > max ? null : t;
}

// Boş → null, geçerli sayı → sayı, geçersiz → undefined (→ 400)
export function optionalNumber(v: unknown, min: number, max: number): number | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

// ISO zaman damgası; boş → null, geçersiz → undefined
export function optionalTimestamp(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// "YYYY-MM-DD"; boş → null, geçersiz → undefined
export function optionalDay(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? undefined : v;
}

export async function getUnitPrice(): Promise<number> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "token_unit_price").maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export async function getPayoutSettings(): Promise<PayoutSettings> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "payout_settings").maybeSingle();
  return parsePayoutSettings(data?.value);
}

export type VenueUsage = { venue_id: string; tokens: number; requests: number; last_spend_at: string | null };

// [from, to) günleri arasında mekan bazında harcanan jeton
export async function getVenueUsage(from: string, to: string): Promise<Map<string, VenueUsage>> {
  const { data, error } = await supabaseAdmin.rpc("venue_token_usage", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const map = new Map<string, VenueUsage>();
  for (const r of (data ?? []) as VenueUsage[]) {
    map.set(r.venue_id, { ...r, tokens: Number(r.tokens), requests: Number(r.requests) });
  }
  return map;
}

const LEAD_TEXT_FIELDS: Record<string, number> = {
  name: 120,
  contact_name: 120,
  contact_role: 80,
  phone: 40,
  email: 160,
  city: 60,
  district: 60,
  address: 300,
  venue_type: 60,
  instagram: 120,
  lost_reason: 500,
  next_action: 300,
  notes: 4000,
};

// Aday alanlarını doğrular. partial=true (PATCH) iken yalnızca gelen alanlar döner.
export function parseLeadFields(
  body: Record<string, unknown>,
  partial: boolean
): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};

  for (const [key, max] of Object.entries(LEAD_TEXT_FIELDS)) {
    if (partial && body[key] === undefined) continue;
    const v = text(body[key], max);
    if (v === null) return { error: `${key} en fazla ${max} karakter olabilir` };
    data[key] = v;
  }
  if (!partial || body.name !== undefined) {
    if (!data.name) return { error: "Mekan adı zorunlu" };
  }

  const enums: [string, readonly string[]][] = [
    ["stage", LEAD_STAGES],
    ["source", LEAD_SOURCES],
    ["priority", PRIORITIES],
  ];
  for (const [key, allowed] of enums) {
    if (body[key] === undefined) continue;
    if (!allowed.includes(body[key] as string)) return { error: `Geçersiz ${key}` };
    data[key] = body[key];
  }

  const numbers: [string, number, number][] = [
    ["capacity", 0, 100000],
    ["estimated_monthly_tokens", 0, 10000000],
    ["proposed_commission_pct", 0, 100],
  ];
  for (const [key, min, max] of numbers) {
    if (partial && body[key] === undefined) continue;
    const n = optionalNumber(body[key], min, max);
    if (n === undefined) return { error: `Geçersiz ${key}` };
    data[key] = key === "proposed_commission_pct" || n === null ? n : Math.round(n);
  }

  if (!partial || body.next_action_at !== undefined) {
    const ts = optionalTimestamp(body.next_action_at);
    if (ts === undefined) return { error: "Geçersiz sonraki adım tarihi" };
    data.next_action_at = ts;
  }

  for (const key of ["venue_id", "application_id"]) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && (typeof body[key] !== "string" || !UUID_RE.test(body[key] as string))) {
      return { error: `Geçersiz ${key}` };
    }
    data[key] = body[key];
  }

  return { data };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
