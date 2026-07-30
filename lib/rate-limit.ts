import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Sayaç veritabanında paylaşımlı tutulur (bkz. 0019 migration): Vercel'de her
// fonksiyon örneğinin kendi belleği olduğu için bellekteki sayaç aşılabilir.

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // saniye
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error || !data) {
    // Sayaç arızalanırsa isteği geçir: limitleyicinin hatası servisi kilitlemesin.
    // Saldırgan bu yolu tetikleyemez — hata ancak veritabanı erişilemezken oluşur,
    // o durumda zaten login de çalışmaz.
    console.error("[rate-limit] sayaç okunamadı:", error?.message);
    return { allowed: true, retryAfter: 0 };
  }

  const result = data as { allowed: boolean; retry_after: number };
  return { allowed: Boolean(result.allowed), retryAfter: Number(result.retry_after ?? 0) };
}

export function tooManyRequests(retryAfter: number, message: string) {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } }
  );
}
