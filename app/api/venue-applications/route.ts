import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseVenueApplicationInput } from "@/lib/validate";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Vitrin sayfasındaki mekan kayıt formu — giriş gerektirmeyen tek yazma ucu.
// Gerçek bir mekan sahibi günde birkaç kez göndermez; sınır spam botlarına göre.
const IP_LIMIT = 3;
const WINDOW_SECONDS = 60 * 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // Bal küpü: gerçek kullanıcıya gizli olan alanı yalnızca formu otomatik dolduran
  // bot doldurur. Bota "gönderildi" de — tekrar denemesin.
  if (typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).website === "string") {
    if ((body as Record<string, string>).website.trim() !== "") {
      return NextResponse.json({ ok: true });
    }
  }

  const parsed = parseVenueApplicationInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const ip = clientIp(req);
  const { allowed, retryAfter } = await consumeRateLimit(
    `venue-application:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!allowed) {
    return tooManyRequests(
      retryAfter,
      "Çok fazla başvuru gönderildi. Lütfen bir süre sonra tekrar deneyin."
    );
  }

  const { error } = await supabaseAdmin.from("venue_applications").insert({
    ...parsed.application,
    ip,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });

  if (error) {
    console.error("[venue-application] kayıt yazılamadı:", error.message);
    return NextResponse.json(
      { error: "Başvuru kaydedilemedi, lütfen tekrar deneyin." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
