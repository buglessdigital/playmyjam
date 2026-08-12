import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { getMyPlaylists, YouTubeQuotaError } from "@/lib/youtube";
import { readYoutubeToken } from "@/lib/youtube-token";

// Mekanın kendi YouTube hesabındaki çalma listeleri (playlists.list?mine=true).
// Zaten aktarılmış olanlar işaretlenir ki seçicide tekrar seçilmesinler.
// Kota: 50 liste başına 1 birim — pratikte ihmal edilebilir.
export async function GET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const token = readYoutubeToken(req);
  if (!token) {
    // Jeton yok ya da süresi dolmuş: istemci "hesabı bağla" düğmesini gösterir
    return NextResponse.json({ error: "YouTube hesabı bağlı değil", reconnect: true }, { status: 401 });
  }

  let playlists;
  try {
    playlists = await getMyPlaylists(token);
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    // 401/403: jeton bayatlamış veya kapsam onaylanmamış — ikisinde de çözüm yeniden bağlanmak
    const message = err instanceof Error ? err.message : "";
    if (message.includes("401") || message.includes("403")) {
      return NextResponse.json(
        { error: "YouTube izni alınamadı, hesabı yeniden bağlayın", reconnect: true },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: "Listeler alınamadı" }, { status: 502 });
  }

  const { data: sources } = await supabaseAdmin
    .from("playlist_sources")
    .select("youtube_playlist_id")
    .eq("venue_id", session.venue_id);

  const imported = new Set((sources ?? []).map((s) => s.youtube_playlist_id));

  return NextResponse.json({
    playlists: playlists.map((p) => ({ ...p, imported: imported.has(p.id) })),
  });
}
