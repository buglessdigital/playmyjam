import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession, getSuperSession, type AdminSession } from "@/lib/session";

// İmzalı çerez tek başına iptal edilemez (stateless). Satırdaki session_version
// ile karşılaştırarak iptal edilebilir hale getiriyoruz — şifre değişince sürüm
// artar, eski çerezler anında geçersiz olur (bkz. 0021 migration).
//
// Her istekte veritabanına gitmemek için sürüm örnek belleğinde kısa süre
// tutulur: iptalin her yere yayılması en fazla bu süre kadar gecikir.
const CACHE_TTL_MS = 30_000;
const versionCache = new Map<string, { version: number; expiresAt: number }>();

const DELETED = -1;

async function currentVersion(adminId: string): Promise<number | null> {
  const cached = versionCache.get(adminId);
  if (cached && cached.expiresAt > Date.now()) return cached.version;

  const { data, error } = await supabaseAdmin
    .from("venue_admins")
    .select("session_version")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    // Sürüm okunamadıysa (ör. migration henüz uygulanmamış) çalışan oturumları
    // düşürme; imza doğrulaması zaten geçerli.
    console.error("[admin-session] sürüm okunamadı:", error.message);
    return null;
  }
  if (!data) return DELETED; // admin kaydı silinmiş

  const version = Number(data.session_version ?? 1);
  versionCache.set(adminId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
  return version;
}

export async function getVerifiedAdminSession(req: NextRequest): Promise<AdminSession | null> {
  const session = getAdminSession(req);
  if (!session) return null;

  const version = await currentVersion(session.admin_id);
  if (version === null) return session;
  if (version === DELETED) return null;

  // sv taşımayan eski çerezler 1 sayılır: bu özellik devreye girerken kimse düşmesin
  return (session.sv ?? 1) === version ? session : null;
}

// Super-admin VEYA bu venue'nun (iptal edilmemiş) admini erişebilir
export async function requireVenueAccessVerified(
  req: NextRequest,
  venueDbId: string
): Promise<boolean> {
  if (getSuperSession(req)) return true;
  const admin = await getVerifiedAdminSession(req);
  return admin !== null && admin.venue_id === venueDbId;
}

// Şifre/kullanıcı adı değişiminde çağrılır: o admine ait tüm çerezler geçersizleşir
export async function revokeAdminSessions(venueDbId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("venue_admins")
    .select("id, session_version")
    .eq("venue_id", venueDbId);

  for (const admin of data ?? []) {
    await supabaseAdmin
      .from("venue_admins")
      .update({ session_version: Number(admin.session_version ?? 1) + 1 })
      .eq("id", admin.id);
    versionCache.delete(admin.id);
  }
}
