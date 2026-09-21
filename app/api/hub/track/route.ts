import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import { sanitizeVenueSlug } from "@/lib/hub";

/**
 * Mekan sayfasındaki sayaç: sayfa açılışı ve satır tıklamaları.
 *
 * Kimlik, çerez, IP saklanmaz — yalnızca günlük TOPLAM artar (bkz. hub_track).
 * Mekan panelinde "son 30 günde kaç kişi menüye baktı" olarak görünür.
 *
 * sendBeacon ile çağrıldığı için yanıt gövdesi kimseyi ilgilendirmez; hata
 * durumunda bile 204 dönülür, sayacın arızası sayfayı etkilemesin.
 */

// Her istek kendi yanıtını üretir: Response gövdesi tek kullanımlıktır
const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.code === "string" ? sanitizeVenueSlug(body.code) : "";
  const linkId = typeof body?.linkId === "string" ? body.linkId : null;
  if (!slug) return noContent();

  // Tek cihazın sayacı şişirmesini sınırla: dakikada 30 olay yeter
  const limit = await consumeRateLimit(`hub-track:${clientIp(req)}`, 30, 60);
  if (!limit.allowed) return noContent();

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id, hub_enabled")
    .eq("slug", slug)
    .maybeSingle<{ id: string; hub_enabled: boolean }>();

  if (!venue?.hub_enabled) return noContent();

  // Satır kimliği mekana ait mi kontrolü SQL tarafında (hub_track): başka
  // mekanın satırı gönderilirse hiçbir şey sayılmaz.
  const { error } = await supabaseAdmin.rpc("hub_track", {
    p_venue: venue.id,
    p_link: linkId,
  });
  if (error) console.error("[hub-track] sayaç yazılamadı:", error.message);

  return noContent();
}
