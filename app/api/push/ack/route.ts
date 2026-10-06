import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/business-server";

// Service worker bildirimi gösterince ("shown") ve dokunulunca ("clicked")
// buraya haber verir — push_deliveries (0061) satırı işaretlenir. "Gönderildi"
// yalnızca push servisinin kabulüdür; telefonda göründüğünün kanıtı bu onaydır.
// Oturum istemez: service worker çerezsiz de çalışabilir, kimlik tahmin
// edilemeyen teslim kimliğidir ve yalnızca zaman damgası yazılır (ilk onay kalır).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const event = body?.event;
  if (!UUID_RE.test(id) || (event !== "shown" && event !== "clicked")) {
    return NextResponse.json({ error: "Geçersiz" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const column = event === "shown" ? "shown_at" : "clicked_at";
  const patch: Record<string, string> = { [column]: now };
  // Dokunulduysa gösterilmiştir: gösterim onayı yolda kaybolmuş olabilir
  if (event === "clicked") {
    await supabaseAdmin.from("push_deliveries").update({ shown_at: now }).eq("id", id).is("shown_at", null);
  }
  await supabaseAdmin.from("push_deliveries").update(patch).eq("id", id).is(column, null);

  return NextResponse.json({ ok: true });
}
