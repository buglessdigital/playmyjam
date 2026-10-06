import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import bcrypt from "bcryptjs";
import { getSuperSession } from "@/lib/session";
import { revokeAdminSessions } from "@/lib/admin-session";
import { likePattern } from "@/lib/admin-username";
import { resolveMapsLink } from "@/lib/maps-link";

export async function GET(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { venueId } = await params;
  const base = "id, slug, name, tagline, logo_url, status, request_cost, priority_cost, hub_enabled, venue_admins(id, username)";
  let { data: venue, error } = await supabaseAdmin
    .from("venues")
    .select(`${base}, maps_url, latitude, longitude`)
    .eq("slug", venueId)
    .single();
  // 0073 uygulanmadan önce konum kolonları yok — ekran yine açılsın
  if (error?.code === "42703") {
    ({ data: venue, error } = await supabaseAdmin.from("venues").select(base).eq("slug", venueId).single());
  }

  if (error || !venue) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  return NextResponse.json(venue);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { venueId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const { name, tagline, logo_url, adminUsername, adminPassword, status, requestCost, priorityCost, hubEnabled, mapsUrl, latitude, longitude } = body;

  const { data: venue } = await supabaseAdmin.from("venues").select("id").eq("slug", venueId).single();
  if (!venue) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });

  const venueUpdate: Record<string, string | number | boolean | null> = {};
  if (typeof name === "string" && name.trim()) venueUpdate.name = name.trim().slice(0, 80);
  if (typeof tagline === "string") venueUpdate.tagline = tagline.trim();
  if (typeof logo_url === "string") venueUpdate.logo_url = logo_url.trim();
  if (status === "active" || status === "inactive") venueUpdate.status = status;
  // Mekan sayfası (plaket arka yüzü) insiyatife bağlı bir hizmet: anlaşma
  // sırasında açılır. Mekan kendi panelinden açıp kapatamaz.
  if (typeof hubEnabled === "boolean") venueUpdate.hub_enabled = hubEnabled;

  // İstek ücretleri (jeton) — yalnızca super admin belirler
  for (const [key, value] of [["request_cost", requestCost], ["priority_cost", priorityCost]] as const) {
    if (value === undefined || value === null || value === "") continue;
    const cost = Number(value);
    if (!Number.isInteger(cost) || cost <= 0) {
      return NextResponse.json({ error: "İstek ücretleri pozitif tam sayı olmalı" }, { status: 400 });
    }
    venueUpdate[key] = cost;
  }

  // Mekanlar haritası konumu (0073). Koordinat elle girildiyse o geçerli;
  // boşsa linkten çıkarılır. Link de koordinat da boşsa mekan haritadan düşer.
  if (mapsUrl !== undefined || latitude !== undefined || longitude !== undefined) {
    const link = typeof mapsUrl === "string" ? mapsUrl.trim().slice(0, 2000) : "";
    const latText = latitude === null || latitude === undefined ? "" : String(latitude).trim();
    const lngText = longitude === null || longitude === undefined ? "" : String(longitude).trim();
    let coords: { lat: number; lng: number } | null = null;

    if (latText || lngText) {
      const lat = Number(latText.replace(",", "."));
      const lng = Number(lngText.replace(",", "."));
      if (!latText || !lngText || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return NextResponse.json({ error: "Enlem/boylam geçersiz (ör. 38.4237 ve 27.1428)" }, { status: 400 });
      }
      coords = { lat, lng };
    } else if (link) {
      coords = await resolveMapsLink(link);
      if (!coords) {
        return NextResponse.json(
          { error: "Linkten konum çıkarılamadı — enlem ve boylamı elle girin" },
          { status: 400 }
        );
      }
    }

    venueUpdate.maps_url = link || null;
    venueUpdate.latitude = coords?.lat ?? null;
    venueUpdate.longitude = coords?.lng ?? null;
  }

  if (Object.keys(venueUpdate).length > 0) {
    const { error: updateError } = await supabaseAdmin.from("venues").update(venueUpdate).eq("id", venue.id);
    if (updateError) {
      return NextResponse.json({ error: `Kaydedilemedi: ${updateError.message}` }, { status: 500 });
    }
    revalidateTag(`venue-${venueId}`, "max");
    revalidateTag("venues-list", "max");
    // Mekan sayfası mekanın slug'ıyla açılıyor (/<slug>/bilgi)
    if (venueUpdate.hub_enabled !== undefined) revalidateTag(`hub-${venueId}`, "max");
  }

  if (typeof adminUsername === "string" && adminUsername.trim()) {
    if (adminUsername.trim().length < 3 || adminUsername.trim().length > 40) {
      return NextResponse.json({ error: "Kullanıcı adı 3-40 karakter olmalı" }, { status: 400 });
    }
    // Giriş harf duyarsız eşleşiyor: aynı adın farklı yazımı başka mekana ait olamaz
    const pattern = likePattern(adminUsername);
    const { data: taken } = pattern
      ? await supabaseAdmin
          .from("venue_admins")
          .select("id, venue_id")
          .ilike("username", pattern)
          .limit(1)
          .maybeSingle()
      : { data: null };
    if (taken && taken.venue_id !== venue.id) {
      return NextResponse.json({ error: "Bu kullanıcı adı kullanılıyor" }, { status: 409 });
    }
    await supabaseAdmin.from("venue_admins").update({ username: adminUsername.trim() }).eq("venue_id", venue.id);
  }

  if (typeof adminPassword === "string" && adminPassword) {
    if (adminPassword.length < 8) {
      return NextResponse.json({ error: "Şifre en az 8 karakter olmalı" }, { status: 400 });
    }
    const hash = await bcrypt.hash(adminPassword, 10);
    await supabaseAdmin.from("venue_admins").update({ password_hash: hash }).eq("venue_id", venue.id);
    // Şifre değişti: o mekanın adminine ait açık tüm oturumlar düşsün
    await revokeAdminSessions(venue.id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { venueId } = await params;
  const { data: venue } = await supabaseAdmin.from("venues").select("id").eq("slug", venueId).single();
  if (!venue) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });

  // venue_id FK'leri ON DELETE CASCADE — kuyruk, istekler, jetonlar,
  // admin hesapları ve mekan şarkıları venues satırıyla birlikte silinir.
  const { error } = await supabaseAdmin.from("venues").delete().eq("id", venue.id);
  if (error) return NextResponse.json({ error: "Mekan silinemedi" }, { status: 500 });

  revalidateTag(`venue-${venueId}`, "max");
  revalidateTag("venues-list", "max");
  return NextResponse.json({ ok: true });
}
