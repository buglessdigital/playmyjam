import { NextRequest, NextResponse, after } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { playSongNow } from "@/lib/queue";
import { runFillUnlocked, startPlaylistFrom, withFillLock } from "@/lib/queue-fill";

// Panelden "şimdi çal": sahnedeki şarkı yarıda kesilir, seçilen şarkı başlar.
//
// İki kaynak var:
//   * { queue_id }            — "sırada" panelindeki satır
//   * { song_id, playlist_id }— playlist/katalog satırı. playlist_id verilirse
//                               rotasyon imleci o listenin o noktasına taşınır,
//                               yani listenin DEVAMI sıraya girer.
//
// Sahnedeki şarkıyı müşteri eklediyse istek 409 ile reddedilir — jetonla alınan
// sıra yarıda kesilemez. Panel düğmeyi zaten kapatır; burası asıl kilit.
export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const queueId = typeof body?.queue_id === "string" ? body.queue_id : "";
  const songId = typeof body?.song_id === "string" ? body.song_id : "";
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : null;

  if (!queueId && !songId) {
    return NextResponse.json({ error: "queue_id ya da song_id gerekli" }, { status: 400 });
  }

  // Kuyruk satırı çalınırken imleç taşınmaz: kuyruğun geri kalanı olduğu gibi
  // devam etmeli.
  const targetList = queueId ? null : playlistId;

  // Senkron kalan tek iş sahne; kuyruk temizliği, imleç ve dolum (onlarca DB
  // turu) yanıttan sonra koşar — düğme bekletmesin, kuyruk Realtime ile düzelir.
  const result = await playSongNow(
    session.venue_id,
    {
      queueId: queueId || undefined,
      songId: songId || undefined,
      playlistId: targetList,
    },
    { deferQueueWork: true }
  );

  // busy: sahneyi değiştiren başka bir iş (biten şarkının ilerletmesi) sürüyor.
  // 503 + anlaşılır mesaj: panel tekrar denesin, "çalınamadı" deyip pes etmesin.
  if (result.busy) {
    return NextResponse.json({ error: "Şu an sıra değişiyor, tekrar deneyin" }, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Çalınamadı" }, { status: 409 });
  }

  const playedSongId = result.song_id;
  after(
    (async () => {
      // Kısa yol: listeyi devret + imleci taşı + kuyruğun başını yaz (iki DB
      // turu), gerisi arkadan gelsin. Panelde sıra saniyeler sonra değil hemen
      // güncellensin diye.
      // İmleç taşıma ve dolum TEK kilit altında: ikisi de aynı rotasyon
      // durumuna yazıyor, araya başka bir dolum girerse kuyruk eski imleçle
      // dolar (bkz. 0047).
      await withFillLock(session.venue_id, async () => {
        if (targetList && playedSongId) {
          await startPlaylistFrom(session.venue_id, targetList, playedSongId);
        }
        await runFillUnlocked(session.venue_id);
      });
    })().catch(() => {})
  );

  return NextResponse.json(result);
}
