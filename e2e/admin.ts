// Mekan admininin oturum çerezini testte imzalar (lib/session.ts signSession
// ile aynı biçim). Sunucu da teste özel E2E_SESSION_SECRET ile çalışıyor.
import { createHmac } from "node:crypto";
import { E2E_SESSION_SECRET } from "./env";

export function adminCookie(admin: { adminId: string; sessionVersion: number }, venueId: string, venueSlug: string) {
  const payload = {
    kind: "admin",
    admin_id: admin.adminId,
    venue_id: venueId,
    venue_slug: venueSlug,
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
    sv: admin.sessionVersion,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", E2E_SESSION_SECRET).update(body).digest("base64url");
  return `admin_session=${body}.${sig}`;
}
