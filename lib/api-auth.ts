import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession, getSuperSession } from "@/lib/session";

// Üç oturum türü de aynı uçları kullanabiliyor: müşteri (Supabase JWT), mekan
// admini ve super-admin (imzalı çerez). Dönen değer hem "giriş yapılmış mı"
// sorusunu yanıtlar hem hız sınırlayıcıya kova anahtarı olur.
export async function identifyCaller(req: NextRequest): Promise<string | null> {
  // İmza doğrulaması yerel ve senkron — önce onlara bak
  const admin = getAdminSession(req);
  if (admin) return `admin:${admin.admin_id}`;
  if (getSuperSession(req)) return "super";

  // getClaims: JWT'yi yerelde doğrular, Auth sunucusuna gitmez
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  return userId ? `user:${userId}` : null;
}
