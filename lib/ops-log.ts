import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Sunucunun yakalayıp yuttuğu sorunların kaydı (0061 system_events) — super
// admin "Sorunlar" ekranı buradan okur. Aynı olay Sentry'ye de gider: ekran
// "ne oldu, hangi mekan"ı, Sentry yığın izini ve uyarıyı taşır.
//
// area: sorunun ait olduğu alan (payment, cron, push, queue, server...).
// kind: alan içindeki tür, ekrandaki filtre anahtarı — küçük harf + alt çizgi.
export type IssueInput = {
  area: string;
  kind: string;
  severity: "warn" | "error";
  message: string;
  venueId?: string | null;
  detail?: Record<string, unknown>;
  error?: unknown;
};

const KEY_RE = /^[a-z_]{1,40}$/;
const AREA_RE = /^[a-z_]{1,24}$/;
// iyzico yanıtı gibi büyük nesneler tabloyu şişirmesin
const MAX_DETAIL_CHARS = 4000;

function boundedDetail(detail: Record<string, unknown>): Record<string, unknown> | null {
  if (Object.keys(detail).length === 0) return null;
  const json = JSON.stringify(detail);
  return json.length <= MAX_DETAIL_CHARS ? detail : { truncated: json.slice(0, MAX_DETAIL_CHARS) };
}

function errorText(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
  return String(err);
}

// Kayıt ASLA asıl işi düşürmemeli: hata yutulur, konsola yazılır
export async function reportIssue(input: IssueInput): Promise<void> {
  const errMessage = errorText(input.error);
  const detail = { ...(input.detail ?? {}), ...(errMessage ? { error: errMessage } : {}) };

  try {
    const tags = { area: input.area, kind: input.kind, ...(input.venueId ? { venue_id: input.venueId } : {}) };
    if (input.error instanceof Error) {
      Sentry.captureException(input.error, { level: input.severity === "error" ? "error" : "warning", tags, extra: detail });
    } else {
      Sentry.captureMessage(input.message, { level: input.severity === "error" ? "error" : "warning", tags, extra: detail });
    }
  } catch {
    // Sentry kapalı/başlatılmamışsa kayıt yine veritabanına düşsün
  }

  const { error } = await supabaseAdmin.from("system_events").insert({
    venue_id: input.venueId ?? null,
    area: AREA_RE.test(input.area) ? input.area : "other",
    kind: KEY_RE.test(input.kind) ? input.kind : "unknown",
    severity: input.severity,
    message: input.message.slice(0, 500),
    detail: boundedDetail(detail),
  });
  if (error) console.error("[ops-log] yazılamadı:", error.message, input.message);
}
