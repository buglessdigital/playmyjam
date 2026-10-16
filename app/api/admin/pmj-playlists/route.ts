import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { listPmjPlaylistsForVenue, setVenuePmjPlaylist } from "@/lib/pmj-playlists";
import { withActor } from "@/lib/actor";

// Mekan panelindeki "PMJ Listeleri" çubuğu (0081): PMJ'nin hazırladığı listeler
// ve mekanda müşteriye açık olup olmadıkları. Açılan liste otomatik çalmaya
// girmez — yalnızca müşterinin seçebileceği kataloğa eklenir.

async function handleGET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  try {
    return NextResponse.json({ playlists: await listPmjPlaylistsForVenue(session.venue_id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Okunamadı" }, { status: 500 });
  }
}

// { pmj_playlist_id, visible }
async function handlePOST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pmjId = typeof body?.pmj_playlist_id === "string" ? body.pmj_playlist_id : "";
  if (!pmjId || typeof body?.visible !== "boolean") {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }
  try {
    await setVenuePmjPlaylist(session.venue_id, pmjId, body.visible);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "İşlem başarısız" }, { status: 500 });
  }
}

export const GET = (...args: Parameters<typeof handleGET>) =>
  withActor("admin-pmj-playlists", () => handleGET(...args));
export const POST = (...args: Parameters<typeof handlePOST>) =>
  withActor("admin-pmj-playlists", () => handlePOST(...args));
