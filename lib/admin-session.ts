import type { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  cookieOptions,
  getAdminSession,
  getSuperSession,
  renewedAdminToken,
  type AdminSession,
} from "@/lib/session";

// İmzalı çerez tek başına iptal edilemez (stateless). Satırdaki session_version
// ile karşılaştırarak iptal edilebilir hale getiriyoruz — şifre değişince sürüm
// artar, eski çerezler anında geçersiz olur (bkz. 0021 migration).
//
// Aynı satırdan Google bağlama zorunluluğu da okunuyor (bkz. 0038): yeni açılan
// mekanlarda kurtarma hesabı bağlanana kadar oturum "beklemede" sayılır.
//
// Her istekte veritabanına gitmemek için durum örnek belleğinde kısa süre
// tutulur: iptalin her yere yayılması en fazla bu süre kadar gecikir.
const CACHE_TTL_MS = 30_000;

type AdminState = { version: number; googleLinkPending: boolean };
const stateCache = new Map<string, { state: AdminState; expiresAt: number }>();

// "deleted": admin kaydı yok. "unknown": satır okunamadı (ör. migration henüz
// uygulanmamış) — bu durumda çalışan oturumlar düşürülmez.
type StateResult = AdminState | "deleted" | "unknown";

async function currentState(adminId: string): Promise<StateResult> {
  const cached = stateCache.get(adminId);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  const { data, error } = await supabaseAdmin
    .from("venue_admins")
    .select("session_version, google_sub, google_link_required")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    console.error("[admin-session] admin durumu okunamadı:", error.message);
    return "unknown";
  }
  if (!data) return "deleted";

  const state: AdminState = {
    version: Number(data.session_version ?? 1),
    // Bağlı hesabı olan admin, bayrak temizlenmemiş olsa bile beklemede değil
    googleLinkPending: data.google_link_required === true && !data.google_sub,
  };
  stateCache.set(adminId, { state, expiresAt: Date.now() + CACHE_TTL_MS });
  return state;
}

export async function getVerifiedAdminSession(
  req: NextRequest,
  // Yalnızca bağlama akışının kendisi (Google callback'i, proxy'nin bağlama
  // sayfasına yönlendirmesi) beklemedeki oturumu görebilmeli
  options?: { allowPendingGoogleLink?: boolean }
): Promise<AdminSession | null> {
  const session = getAdminSession(req);
  if (!session) return null;

  const state = await currentState(session.admin_id);
  if (state === "unknown") return session;
  if (state === "deleted") return null;

  // sv taşımayan eski çerezler 1 sayılır: bu özellik devreye girerken kimse düşmesin
  if ((session.sv ?? 1) !== state.version) return null;
  if (state.googleLinkPending && !options?.allowPendingGoogleLink) return null;
  return session;
}

// Google kurtarma hesabı bağlanana kadar panel kilitli mi?
export async function adminGoogleLinkPending(adminId: string): Promise<boolean> {
  const state = await currentState(adminId);
  return state !== "unknown" && state !== "deleted" && state.googleLinkPending;
}

// Hesap bağlandığı anda kilidin kalkması için önbelleği düşür
export function forgetAdminState(adminId: string): void {
  stateCache.delete(adminId);
}

// Super-admin VEYA bu venue'nun (iptal edilmemiş) admini erişebilir.
// Oturumu da döndürür: çağıran taraf yanıta taze çerez basabilsin diye.
export type VenueAccess = { kind: "super" } | { kind: "admin"; session: AdminSession };

export async function venueAccess(
  req: NextRequest,
  venueDbId: string
): Promise<VenueAccess | null> {
  if (getSuperSession(req)) return { kind: "super" };
  const admin = await getVerifiedAdminSession(req);
  if (admin && admin.venue_id === venueDbId) return { kind: "admin", session: admin };
  return null;
}

export async function requireVenueAccessVerified(
  req: NextRequest,
  venueDbId: string
): Promise<boolean> {
  return (await venueAccess(req, venueDbId)) !== null;
}

// Kayan süre: oturumun sonuna yaklaşıldıysa yanıta yeni çerez basılır.
// Mekan ekranı sayfa gezinmesi yapmadığı için asıl yenileme buradan gelir.
export function renewAdminCookie<T extends NextResponse>(res: T, access: VenueAccess | null): T {
  if (access?.kind !== "admin") return res;
  const token = renewedAdminToken(access.session);
  if (token) res.cookies.set(ADMIN_SESSION_COOKIE, token, cookieOptions(ADMIN_SESSION_MAX_AGE));
  return res;
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
    stateCache.delete(admin.id);
  }
}
