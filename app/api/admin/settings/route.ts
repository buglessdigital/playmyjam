import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";

// Bir şarkı isteğinin jeton maliyeti mekana özeldir (varsayılan 1 / 2).
// Jeton fiyatı globaldir — burada değişen sadece kaç jeton harcandığı.
const MAX_COST = 50;
const MAX_LOGO_URL = 500;
// Crossfade: şarkı geçişlerinde çapraz solma süresi (0 = kapalı). now_playing'de
// durur, çünkü player zaten o satırı Realtime ile dinliyor (bkz. 0039).
const MAX_CROSSFADE_MS = 12_000;
const DEFAULT_CROSSFADE_MS = 4_000;

function parseCrossfade(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_CROSSFADE_MS) return null;
  // 500 ms'e yuvarla: kaydırıcı yarım saniyelik adımlarla çalışıyor
  return Math.round(ms / 500) * 500;
}

// Logo mekan listelerinde <img> ile gösteriliyor; sadece http(s) adreslerine izin ver.
function parseLogoUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (url === "") return "";
  if (url.length > MAX_LOGO_URL || !/^https?:\/\/\S+$/i.test(url)) return null;
  return url;
}

function parseCost(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const cost = Number(value);
  if (!Number.isInteger(cost) || cost < 1 || cost > MAX_COST) return null;
  return cost;
}

export async function GET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("name, request_cost, priority_cost, logo_url")
    .eq("id", session.venue_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  }

  // 0039 uygulanmadıysa kolon yoktur — ayarlar sayfası bu yüzden komple düşmesin,
  // varsayılanla devam eder (yazma denemesi anlaşılır bir hata döndürür)
  const { data: np } = await supabaseAdmin
    .from("now_playing")
    .select("crossfade_ms")
    .eq("venue_id", session.venue_id)
    .maybeSingle();

  return NextResponse.json({
    name: data.name,
    request_cost: data.request_cost ?? 1,
    priority_cost: data.priority_cost ?? 2,
    logo_url: data.logo_url ?? "",
    crossfade_ms: (np as { crossfade_ms?: number } | null)?.crossfade_ms ?? DEFAULT_CROSSFADE_MS,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requestCost = parseCost(body?.requestCost);
  const priorityCost = parseCost(body?.priorityCost);
  if (requestCost === null || priorityCost === null) {
    return NextResponse.json(
      { error: `İstek ücretleri 1 ile ${MAX_COST} arasında tam sayı olmalı` },
      { status: 400 }
    );
  }

  const logoUrl = parseLogoUrl(body?.logoUrl);
  if (logoUrl === null) {
    return NextResponse.json(
      { error: "Logo adresi https:// ile başlayan geçerli bir bağlantı olmalı" },
      { status: 400 }
    );
  }

  const crossfadeMs = parseCrossfade(body?.crossfadeMs);
  if (crossfadeMs === null) {
    return NextResponse.json(
      { error: `Geçiş süresi 0 ile ${MAX_CROSSFADE_MS / 1000} saniye arasında olmalı` },
      { status: 400 }
    );
  }

  const update: Record<string, string | number> = {
    request_cost: requestCost,
    priority_cost: priorityCost,
  };
  if (logoUrl !== undefined) update.logo_url = logoUrl;

  const { error } = await supabaseAdmin
    .from("venues")
    .update(update)
    .eq("id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Geçiş süresi ayrı tabloda: player onu Realtime ile duyup anında uygular
  if (crossfadeMs !== undefined) {
    const { error: crossfadeError } = await supabaseAdmin
      .from("now_playing")
      .update({ crossfade_ms: crossfadeMs })
      .eq("venue_id", session.venue_id);
    if (crossfadeError) {
      console.error("[settings] crossfade süresi yazılamadı:", crossfadeError.message);
      return NextResponse.json(
        { error: "Geçiş süresi kaydedilemedi — diğer ayarlar kaydedildi" },
        { status: 500 }
      );
    }
  }

  // Müşteri sayfaları ücreti önbellekli mekan satırından okuyor (lib/venue-cache)
  revalidateTag(`venue-${session.venue_slug}`, "max");
  // Logo /mekanlar listesinden geliyor — o liste de tazelensin
  if (logoUrl !== undefined) revalidateTag("venues-list", "max");
  return NextResponse.json({
    ok: true,
    request_cost: requestCost,
    priority_cost: priorityCost,
    logo_url: logoUrl,
    crossfade_ms: crossfadeMs,
  });
}
