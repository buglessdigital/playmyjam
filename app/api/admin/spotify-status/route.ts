import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/session";

// Spotify refresh token'ı tarayıcıya sızdırmadan bağlantı durumunu döner
export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("spotify_refresh_token, spotify_account_name")
    .eq("id", session.venue_id)
    .single();

  return NextResponse.json({
    connected: !!venue?.spotify_refresh_token,
    account_name: venue?.spotify_account_name ?? null,
    venue_id: session.venue_id,
  });
}
