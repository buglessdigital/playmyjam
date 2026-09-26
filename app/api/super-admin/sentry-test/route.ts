import { NextRequest, NextResponse } from "next/server";
import { getSuperSession } from "@/lib/session";

// Hata takibinin uçtan uca çalıştığını doğrulamak için kasıtlı sunucu hatası.
// Yakalanmayan hata onRequestError üzerinden Sentry'ye düşmeli (bkz. instrumentation.ts).
export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  throw new Error(`Sentry test hatası (${new Date().toISOString()})`);
}
