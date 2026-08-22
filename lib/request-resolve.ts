import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addSongToVenuePlaylist } from "@/lib/playlist";
import {
  approveSuggestion,
  expireStaleRequests,
  isDecidable,
  rejectSuggestion,
} from "@/lib/request-approval";

// Panel düğmeleri (/api/admin/requests) ve bildirim üstündeki onay/ret
// (/api/admin/requests/act) aynı gövdeyi kullanır — kural tek yerde.
//
// İki tür talep tek yoldan sonuçlanır:
//  * song_id dolu  → mekan listesinde zaten olan şarkı için istek (eski akış):
//    kabul edilirse şarkı mekanın kalıcı playlist'ine eklenir.
//  * song_id boş   → müşterinin yazdığı serbest metin talep (0045): kabul
//    edilirse ortak havuzdaki en iyi sürüm TEK SEFERLİK çalma hakkı olarak
//    açılır, kalıcı kataloğa girmez. Havuzda yoksa admin bağlantı yapıştırır.
export async function resolveRequest(
  venueId: string,
  requestId: string,
  status: "accepted" | "rejected",
  /** Admin'in yapıştırdığı YouTube bağlantısı — havuzda tanınmayan talepler için */
  videoUrl?: string
): Promise<NextResponse> {
  // Karar anında süre kontrolü: 10 dakikası dolmuş talep artık onaylanamaz
  await expireStaleRequests(venueId);

  const { data: request } = await supabaseAdmin
    .from("song_requests")
    .select(
      "id, venue_id, user_id, status, expires_at, suggested_title, suggested_artist, song_id, songs(youtube_video_id, title, artist, album_cover_url, duration_ms)"
    )
    .eq("id", requestId)
    .eq("venue_id", venueId)
    .single();

  if (!request) {
    return NextResponse.json({ error: "İstek bulunamadı" }, { status: 404 });
  }
  if (request.status === "expired") {
    return NextResponse.json(
      { error: "Talebin 10 dakikalık süresi doldu", code: "expired" },
      { status: 409 }
    );
  }
  if (!isDecidable(request)) {
    return NextResponse.json({ error: "İstek zaten sonuçlandırılmış" }, { status: 409 });
  }

  if (status === "rejected") {
    await rejectSuggestion(request);
    return NextResponse.json({ ok: true });
  }

  // Serbest metin talep: şarkıyı çöz + tek seferlik hak aç + müşteriye push
  if (!request.song_id) {
    const result = await approveSuggestion(request, videoUrl);
    if (!result.ok) {
      // code:"needs_link" → panel yapıştırma alanını açar (bkz. requests/page.tsx)
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, title: result.title, artist: result.artist });
  }

  // Eski akış: katalogdaki şarkı için istek — kalıcı playlist'e eklenir
  const songRel = request.songs as unknown as
    | { youtube_video_id: string; title: string; artist: string; album_cover_url: string | null; duration_ms: number }
    | { youtube_video_id: string; title: string; artist: string; album_cover_url: string | null; duration_ms: number }[]
    | null;
  const song = Array.isArray(songRel) ? songRel[0] : songRel;
  if (song?.youtube_video_id) {
    const result = await addSongToVenuePlaylist(venueId, {
      youtube_video_id: song.youtube_video_id,
      title: song.title,
      artist: song.artist,
      album_cover_url: song.album_cover_url ?? "",
      duration_ms: song.duration_ms,
    });
    if ("error" in result && result.status !== 409) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (!("error" in result)) {
      revalidateTag(`venue-songs-${venueId}`, "max");
    }
  }

  const { error } = await supabaseAdmin
    .from("song_requests")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("venue_id", venueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
