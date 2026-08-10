import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { playSongNow } from "@/lib/queue";

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

  const result = await playSongNow(session.venue_id, {
    queueId: queueId || undefined,
    songId: songId || undefined,
    // Kuyruk satırı çalınırken imleç taşınmaz: kuyruğun geri kalanı olduğu gibi
    // devam etmeli.
    playlistId: queueId ? null : playlistId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Çalınamadı" }, { status: 409 });
  }
  return NextResponse.json(result);
}
