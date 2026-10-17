import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { assertVenuePlaylist } from "@/lib/playlist";
import { removeGoneSongs, syncPlaylistSources } from "@/lib/playlist-sync";
import { resetAutoQueue } from "@/lib/queue-fill";
import { reportQueueWorkFailure } from "@/lib/queue";
import { withActor } from "@/lib/actor";

// "Şimdi güncelle": tek playlist'i beklemeden YouTube kaynağıyla eşitler.
// Günlük cron aynı işi kendiliğinden yapıyor; bu buton mekan sabırsızlandığında
// veya senkron hata verip durduğunda elle tetiklemek için.
// force: sıra ve şarkı-sayısı kısayolu atlanır — mekan butona bastıysa listenin
// gerçekten okunduğunu görmeli.
// HİÇBİR ŞEY SİLMEZ (17 Eki 2026): YouTube'dan çıkarılmış ama listede duran
// şarkılar yanıtta `gone` olarak döner, panel mekana sorar. Mekan onaylarsa
// aynı uca `remove_video_ids` ile gelinir ve yalnızca onlar kaldırılır.
async function handlePOST(req: NextRequest) {
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

  // Mekanın onayı: panelde gösterilen çıkarılmış şarkılardan seçilenler kalkar
  const removeIds: unknown = body?.remove_video_ids;
  if (Array.isArray(removeIds)) {
    const ids = removeIds.filter((id): id is string => typeof id === "string").slice(0, 500);
    try {
      const removed = await removeGoneSongs(playlistId, ids);
      // Kuyruk liste sonuna kadar yazılı: kaldırılan şarkıların bekleyen
      // otomatik satırları da düşmeli, yoksa listeden çıkmış şarkı yine çalar
      if (removed > 0) {
        after(
          resetAutoQueue(session.venue_id).catch((err) =>
            reportQueueWorkFailure(session.venue_id, "çıkarılmış şarkıları kaldır", err)
          )
        );
      }
      return NextResponse.json({ ok: true, removed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kaldırılamadı";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const report = await syncPlaylistSources({
      playlistIds: [playlistId],
      force: true,
      collectGone: true,
    });
    return NextResponse.json({
      ok: true,
      added: report.added,
      failed: report.failed,
      gone: report.gone.map((g) => ({ video_id: g.video_id, title: g.title, artist: g.artist })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Senkron başarısız";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Kuyruk sağlık kaydı değişikliği bu adla yazar (bkz. lib/actor.ts)
export const POST = (...args: Parameters<typeof handlePOST>) =>
  withActor("admin-playlist-sync", () => handlePOST(...args));
