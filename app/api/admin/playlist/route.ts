import { NextRequest, NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { parseSongInput } from "@/lib/validate";
import { addSongToVenuePlaylist, assertVenuePlaylist } from "@/lib/playlist";
import { AUTO_ADDED_BY, fillQueue, runFillUnlocked, withFillLock } from "@/lib/queue-fill";

export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseSongInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Hedef playlist belirtilmezse varsayılana (aktif olan ilk liste) düşer
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : undefined;
  if (playlistId && !(await assertVenuePlaylist(session.venue_id, playlistId))) {
    return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
  }

  const result = await addSongToVenuePlaylist(session.venue_id, parsed.song, playlistId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  // Kuyruk listelerin sonuna kadar yazılı: yeni şarkı kendiliğinden görünmez,
  // kuyruğun arkasına eklenmesi gerekir. Yanıttan SONRA — düğme beklemez.
  after(fillQueue(session.venue_id).catch(() => {}));
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const venueSongId = typeof body?.venue_song_id === "string" ? body.venue_song_id : "";
  const inVenueList = body?.in_venue_list;
  if (!venueSongId || typeof inVenueList !== "boolean") {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("venue_songs")
    .update({ in_venue_list: inVenueList })
    .eq("id", venueSongId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const venueSongId = typeof body?.venue_song_id === "string" ? body.venue_song_id : "";
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  if (!venueSongId) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const { data: venueSong } = await supabaseAdmin
    .from("venue_songs")
    .select("song_id")
    .eq("id", venueSongId)
    .eq("venue_id", session.venue_id)
    .maybeSingle();

  if (!venueSong) {
    return NextResponse.json({ error: "Şarkı bulunamadı" }, { status: 404 });
  }

  // playlist_id verilirse yalnızca o listeden çıkarılır; verilmezse şarkı mekanın
  // tüm listelerinden düşer. Her iki yolda da son üyelik gidince 0026'daki trigger
  // katalog satırını (venue_songs) siler.
  const membershipQuery = supabaseAdmin
    .from("playlist_songs")
    .delete()
    .eq("venue_id", session.venue_id)
    .eq("song_id", venueSong.song_id);

  const { error } = playlistId
    ? await membershipQuery.eq("playlist_id", playlistId)
    : await membershipQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 0026 öncesinden kalmış, hiç üyeliği olmayan katalog satırları için emniyet:
  // trigger tetiklenmediyse tam silmede satır burada temizlenir.
  if (!playlistId) {
    await supabaseAdmin
      .from("venue_songs")
      .delete()
      .eq("id", venueSongId)
      .eq("venue_id", session.venue_id);
  }

  // Kuyruk artık saatler ilerisini tuttuğu için listeden çıkarılan şarkı
  // kuyrukta öylece kalır ve yine çalardı: bekleyen OTOMATİK satırı düşürülür,
  // boşalan yer bir sonraki dolumda kapanır. Müşterinin jetonla aldığı satıra
  // ve sahnedeki şarkıya dokunulmaz.
  after(
    (async () => {
      // Satır düşürme ve dolum TEK kilit altında (0047): arada başka bir dolum
      // koşarsa boşalan yer eski durumla kapanır.
      await withFillLock(session.venue_id, async () => {
        await supabaseAdmin
          .from("queue")
          .update({ status: "removed" })
          .eq("venue_id", session.venue_id)
          .eq("status", "queued")
          .is("user_id", null)
          .eq("added_by", AUTO_ADDED_BY)
          .eq("song_id", venueSong.song_id);
        await runFillUnlocked(session.venue_id);
      });
    })().catch(() => {})
  );

  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  return NextResponse.json({ ok: true });
}
