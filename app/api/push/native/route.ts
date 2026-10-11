import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";

// Mağaza uygulamasının push cihaz kodunu kaydeder (0077). Uygulama her
// açılışta ve oturum değişince yeniden çağırır (components/native/NativeAppBridge):
// kod cihaza aittir, en son giriş yapan kullanıcıya taşınır. Misafir de
// kaydolur — talep onayı bildirimi misafire de gider.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });

  const limit = await consumeRateLimit(`native-push:${userId}`, 20, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "Çok fazla deneme" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { token?: unknown; platform?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = body?.platform;
  if ((platform !== "android" && platform !== "ios") || token.length < 16 || token.length > 4096) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("native_push_tokens")
    .upsert(
      { user_id: userId, platform, token, updated_at: new Date().toISOString() },
      { onConflict: "token" }
    );
  if (error) {
    console.error("[native-push] kayıt yazılamadı:", error.message);
    return NextResponse.json({ error: "Kaydedilemedi" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
