import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { assertVenuePlaylist } from "@/lib/playlist";
import { syncPlaylistSources } from "@/lib/playlist-sync";

// "Şimdi güncelle": tek playlist'i beklemeden YouTube kaynağıyla eşitler.
// Günlük cron aynı işi kendiliğinden yapıyor; bu buton mekan sabırsızlandığında
// veya senkron hata verip durduğunda elle tetiklemek için.
// force: sıra ve şarkı-sayısı kısayolu atlanır — mekan butona bastıysa listenin
// gerçekten okunduğunu görmeli.
export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  if (!playlistId) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }
  if (!(await assertVenuePlaylist(session.venue_id, playlistId))) {
    return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
  }

  const { data: source } = await supabaseAdmin
    .from("playlist_sources")
    .select("playlist_id")
    .eq("playlist_id", playlistId)
    .eq("venue_id", session.venue_id)
    .maybeSingle();

  if (!source) {
    return NextResponse.json(
      { error: "Bu liste YouTube'dan içe aktarılmadı" },
      { status: 400 }
    );
  }

  try {
    const report = await syncPlaylistSources({ playlistIds: [playlistId], force: true });
    return NextResponse.json({ ok: true, added: report.added, failed: report.failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Senkron başarısız";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
