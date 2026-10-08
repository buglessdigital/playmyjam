import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { reportIssue } from "@/lib/ops-log";
import {
  deviceHash,
  issueGiftNonce,
  verifyDeviceProof,
  verifyGiftNonce,
  type DevicePlatform,
} from "@/lib/app-gift";

// Mobil uygulamaya geçene hediye jeton (0076). Uygulama kabuğu iki adımda çağırır:
//   GET  → { nonce }                       (kanıta gömülecek meydan okuma)
//   POST { platform, nonce, proof } → { status, tokens?, balance? }
// status: granted | already_claimed | device_used | guest | unverified
// Kurallar ve neden fail-closed olduğu: lib/app-gift.ts

async function currentUser(): Promise<{ id: string; anonymous: boolean } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; is_anonymous?: boolean } | undefined;
  return claims?.sub ? { id: claims.sub, anonymous: claims.is_anonymous === true } : null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  if (user.anonymous) return NextResponse.json({ status: "guest" });

  const { data } = await supabaseAdmin
    .from("app_gift_claims")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data) return NextResponse.json({ status: "already_claimed" });

  return NextResponse.json({ nonce: issueGiftNonce(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  if (user.anonymous) return NextResponse.json({ status: "guest" });

  const limit = await consumeRateLimit(`app-gift:${user.id}`, 5, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Çok fazla deneme" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    platform?: string;
    nonce?: string;
    proof?: string;
  } | null;
  const platform = body?.platform;
  if (
    (platform !== "ios" && platform !== "android") ||
    typeof body?.proof !== "string" ||
    !body.proof ||
    body.proof.length > 20_000 ||
    !verifyGiftNonce(body.nonce, user.id)
  ) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const verdict = await verifyDeviceProof(platform as DevicePlatform, body.proof, body.nonce!);
  if (!verdict.ok) {
    return NextResponse.json({ status: "unverified", reason: verdict.reason });
  }

  const { data, error } = await supabaseAdmin.rpc("claim_app_gift", {
    p_user_id: user.id,
    p_device_hash: deviceHash(platform as DevicePlatform, verdict.deviceKey),
    p_platform: platform,
  });
  if (error || !data) {
    await reportIssue({
      area: "app",
      kind: "app_gift_failed",
      severity: "error",
      message: "Uygulama hediyesi verilemedi",
      error,
    });
    return NextResponse.json({ error: "Hediye verilemedi" }, { status: 500 });
  }
  return NextResponse.json(data);
}
