import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentActor } from "@/lib/actor";

// Mekan sağlık kaydı (0055 venue_events). Kuyruk olaylarını veritabanı
// tetikleyicisi yazar; buradan yalnızca player olayları yazılır.
export type VenueEventSeverity = "info" | "warn" | "error";

export type VenueEventInput = {
  kind: string;
  severity: VenueEventSeverity;
  message: string;
  detail?: Record<string, unknown>;
  at?: string;
};

const SEVERITIES = new Set<VenueEventSeverity>(["info", "warn", "error"]);
const KIND_RE = /^[a-z_]{1,40}$/;
// Player'ın tek heartbeat'te taşıyabileceği olay: çevrimdışı birikmiş kuyruk
// bir seferde boşalsın ama sınırsız büyüyemesin
export const MAX_CLIENT_EVENTS = 30;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Kayıt ASLA asıl işi düşürmemeli: hata yutulur, konsola yazılır
export async function logVenueEvents(
  venueId: string,
  category: "player" | "queue",
  events: VenueEventInput[]
): Promise<void> {
  if (events.length === 0) return;
  const actor = currentActor() ?? null;
  const { error } = await supabaseAdmin.from("venue_events").insert(
    events.map((e) => ({
      venue_id: venueId,
      category,
      kind: e.kind,
      severity: e.severity,
      actor,
      message: e.message.slice(0, 300),
      detail: e.detail ?? null,
      ...(e.at ? { at: e.at } : {}),
    }))
  );
  if (error) console.error("[venue-events] yazılamadı:", error.message);
}

// Player'dan gelen ham olay listesini doğrular. Zaman damgası player'ın
// saatidir (olayın gerçekten olduğu an — heartbeat çevrimdışıyken gecikebilir);
// saçma değerler sunucu saatine çekilir.
export function parseClientEvents(raw: unknown): VenueEventInput[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out: VenueEventInput[] = [];
  for (const item of raw.slice(0, MAX_CLIENT_EVENTS)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.kind !== "string" || !KIND_RE.test(e.kind)) continue;
    if (typeof e.severity !== "string" || !SEVERITIES.has(e.severity as VenueEventSeverity)) continue;
    if (typeof e.message !== "string" || !e.message.trim()) continue;
    const at = typeof e.at === "number" && e.at <= now + 60_000 && e.at >= now - MAX_AGE_MS ? e.at : now;
    out.push({
      kind: e.kind,
      severity: e.severity as VenueEventSeverity,
      message: e.message,
      at: new Date(at).toISOString(),
      detail:
        e.detail && typeof e.detail === "object" && JSON.stringify(e.detail).length <= 2000
          ? (e.detail as Record<string, unknown>)
          : undefined,
    });
  }
  return out;
}
