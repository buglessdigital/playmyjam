import { NextRequest, NextResponse, after } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { finishVenuePmj, listPmjPlaylistsForVenue, setVenuePmjIntent } from "@/lib/pmj-playlists";
import { withActor } from "@/lib/actor";
import { reportIssue } from "@/lib/ops-log";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
  const { data: pmj } = await supabaseAdmin.from("pmj_playlists").select("id, name").eq("id", pmjId).maybeSingle();
  if (!pmj) return NextResponse.json({ error: "PMJ listesi bulunamadı" }, { status: 404 });

  const venueId = session.venue_id;
  const visible: boolean = body.visible;
  try {
    // Hızlı adım: niyet hemen yazılır (kapatmada müşteriden anında gizlenir)
    await setVenuePmjIntent(venueId, pmjId, visible);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "İşlem başarısız" }, { status: 500 });
  }

  // Ağır adım yanıttan SONRA: 900 şarkılık listede açma ~4-6 sn sürüyordu ve
  // panel bu süre boyunca dönen simgede bekliyordu. Müşteri kataloğu birkaç
  // saniye içinde güncellenir. Hata Sorunlar ekranına (bkz. lib/pmj-playlists.ts).
  after(async () => {
    try {
      await finishVenuePmj(venueId, pmjId);
    } catch (err) {
      await reportIssue({
        area: "server",
        kind: "pmj_playlist_toggle_failed",
        severity: "error",
        message: `PMJ listesi "${pmj.name}" ${visible ? "açılırken" : "kapatılırken"} hata`,
        venueId,
        error: err,
      });
    }
  });
  return NextResponse.json({ ok: true });
}

export const GET = (...args: Parameters<typeof handleGET>) =>
  withActor("admin-pmj-playlists", () => handleGET(...args));
export const POST = (...args: Parameters<typeof handlePOST>) =>
  withActor("admin-pmj-playlists", () => handlePOST(...args));
