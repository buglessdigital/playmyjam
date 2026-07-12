import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import bcrypt from "bcryptjs";
import { getSuperSession } from "@/lib/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { venueId } = await params;
  const { data: venue, error } = await supabaseAdmin
    .from("venues")
    .select("id, slug, name, tagline, logo_url, status, venue_admins(id, username)")
    .eq("slug", venueId)
    .single();

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

  const { name, tagline, logo_url, adminUsername, adminPassword, status } = body;

  const { data: venue } = await supabaseAdmin.from("venues").select("id").eq("slug", venueId).single();
  if (!venue) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });

  const venueUpdate: Record<string, string> = {};
  if (typeof name === "string" && name.trim()) venueUpdate.name = name.trim().slice(0, 80);
  if (typeof tagline === "string") venueUpdate.tagline = tagline.trim();
  if (typeof logo_url === "string") venueUpdate.logo_url = logo_url.trim();
  if (status === "active" || status === "inactive") venueUpdate.status = status;

  if (Object.keys(venueUpdate).length > 0) {
    await supabaseAdmin.from("venues").update(venueUpdate).eq("id", venue.id);
    revalidateTag(`venue-${venueId}`, "max");
  }

  if (typeof adminUsername === "string" && adminUsername.trim()) {
    if (adminUsername.trim().length < 3 || adminUsername.trim().length > 40) {
      return NextResponse.json({ error: "Kullanıcı adı 3-40 karakter olmalı" }, { status: 400 });
    }
    await supabaseAdmin.from("venue_admins").update({ username: adminUsername.trim() }).eq("venue_id", venue.id);
  }

  if (typeof adminPassword === "string" && adminPassword) {
    if (adminPassword.length < 8) {
      return NextResponse.json({ error: "Şifre en az 8 karakter olmalı" }, { status: 400 });
    }
    const hash = await bcrypt.hash(adminPassword, 10);
    await supabaseAdmin.from("venue_admins").update({ password_hash: hash }).eq("venue_id", venue.id);
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
  return NextResponse.json({ ok: true });
}
