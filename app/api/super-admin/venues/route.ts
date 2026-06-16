import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select(`
      id, slug, name, tagline, logo_url, status, created_at,
      venue_admins(username),
      user_tokens(user_id),
      song_requests(id, requested_at)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const tagline = typeof body.tagline === "string" ? body.tagline.trim() : "";
  const logo_url = typeof body.logo_url === "string" ? body.logo_url.trim() : "";
  const admin_username = typeof body.admin_username === "string" ? body.admin_username.trim() : "";
  const admin_password = typeof body.admin_password === "string" ? body.admin_password : "";

  if (!slug || !name || !admin_username || !admin_password) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Slug yalnızca küçük harf, rakam ve tire içerebilir (2-40 karakter)" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Mekan adı en fazla 80 karakter olabilir" }, { status: 400 });
  }
  if (admin_username.length < 3 || admin_username.length > 40) {
    return NextResponse.json({ error: "Kullanıcı adı 3-40 karakter olmalı" }, { status: 400 });
  }
  if (admin_password.length < 8) {
    return NextResponse.json({ error: "Şifre en az 8 karakter olmalı" }, { status: 400 });
  }

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .insert({ slug, name, tagline, logo_url, status: "active" })
    .select()
    .single();

  if (venueError) {
    return NextResponse.json({ error: venueError.message }, { status: 500 });
  }

  const password_hash = await bcrypt.hash(admin_password, 10);
  await supabaseAdmin.from("venue_admins").insert({
    venue_id: venue.id,
    username: admin_username,
    password_hash,
  });

  // Varsayılan token paketleri ekle
  await supabaseAdmin.from("token_packages").insert([
    { venue_id: venue.id, label: "Başlangıç", tokens: 5, price: 50, popular: false, display_order: 1 },
    { venue_id: venue.id, label: "Popüler", tokens: 12, price: 100, popular: true, display_order: 2 },
    { venue_id: venue.id, label: "Süper", tokens: 25, price: 180, popular: false, display_order: 3 },
    { venue_id: venue.id, label: "Mega", tokens: 50, price: 300, popular: false, display_order: 4 },
  ]);

  // Boş now_playing satırı ekle
  await supabaseAdmin.from("now_playing").insert({ venue_id: venue.id, is_playing: false });

  return NextResponse.json({ ok: true, venue });
}
