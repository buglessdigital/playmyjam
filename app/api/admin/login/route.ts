import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_SESSION_COOKIE, cookieOptions, signSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  const { data: admin, error } = await supabaseAdmin
    .from("venue_admins")
    .select("id, username, password_hash, venue_id, venues(id, slug, name, tagline, logo_url)")
    .eq("username", username)
    .single();

  if (error || !admin) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
  }

  const venue = Array.isArray(admin.venues) ? admin.venues[0] : admin.venues;
  if (!venue) {
    return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 401 });
  }

  const maxAge = 60 * 60 * 24 * 7; // 7 gün
  const token = signSession({
    kind: "admin",
    admin_id: admin.id,
    venue_id: admin.venue_id,
    venue_slug: venue.slug,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  });

  const res = NextResponse.json({ ok: true, venue });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}
