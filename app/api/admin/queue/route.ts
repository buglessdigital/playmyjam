import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { parseSongInput } from "@/lib/validate";
import {
  AUTO_POSITION_BASE,
  clearManualQueue,
  enqueueManual,
  fillQueue,
  playlistSongsForQueue,
} from "@/lib/queue-fill";

// "Sıraya ekle": şarkı ÇALAN ŞARKIDAN HEMEN SONRA çalar (Spotify'daki gibi).
// Satır user_id null'dır — jeton harcanmaz, 30 dk kilidi doğurmaz — ve
// müşterinin jetonla aldığı sıranın ARKASINA girer; çalan listenin otomatik
// şarkılarının ise ÖNÜNE (bkz. lib/queue-fill.ts pozisyon bantları).
export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Bütün bir listeyi sıraya ekleme: liste sırasıyla (karıştırmalıysa rastgele)
  // tek blok halinde girer, çalan liste kesilmeden beklemeye geçer.
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  if (playlistId) {
    const { data: playlist } = await supabaseAdmin
      .from("playlists")
      .select("id")
      .eq("id", playlistId)
      .eq("venue_id", session.venue_id)
      .maybeSingle();
    if (!playlist) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    const songIds = await playlistSongsForQueue(session.venue_id, playlistId);
    if (songIds.length === 0) {
      return NextResponse.json({ error: "Bu listede çalınabilir şarkı yok" }, { status: 409 });
    }
    const added = await enqueueManual(session.venue_id, songIds, playlistId);
    return NextResponse.json({ ok: true, added });
  }

  const parsed = parseSongInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const song = parsed.song;

  // Katalogdan bağımsız: şarkı mekanın listesinde olmasa da kuyruğa girebilir.
  // songs satırı yine de gerekli (kuyruk song_id ile bağlanıyor).
  const { data: songRow, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(
      {
        youtube_video_id: song.youtube_video_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url,
        duration_ms: song.duration_ms,
      },
      { onConflict: "youtube_video_id" }
    )
    .select("id, embeddable")
    .single();

  if (songErr || !songRow) {
    return NextResponse.json({ error: songErr?.message ?? "Şarkı kaydedilemedi" }, { status: 500 });
  }

  if (songRow.embeddable === false) {
    return NextResponse.json(
      { error: "Bu şarkı YouTube'da dış oynatıcıya kapalı, çalınamıyor" },
      { status: 400 }
    );
  }

  // Zaten sırada olması engel DEĞİL: mekan aynı şarkıyı bilerek tekrar sıraya
  // alabilir, o zaman iki kez çalar. (Müşteri tarafındaki "zaten sırada" kuralı
  // duruyor — bkz. request_song, 0005.)

  // Elle sıra bloğunun sonuna: çalan şarkıdan sonra, çalan listenin önünde
  const added = await enqueueManual(session.venue_id, [songRow.id], null);
  if (added === 0) {
    return NextResponse.json({ error: "Sıra dolu — önce sırayı temizleyin" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, song_id: songRow.id });
}

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // "Sırayı temizle": yalnızca elle sıraya eklenenler düşer. Çalan listenin
  // şarkıları ve müşterinin jetonla aldığı sıra olduğu gibi kalır.
  if (body?.clear === "manual") {
    const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : undefined;
    await clearManualQueue(session.venue_id, playlistId);
    // Boşalan yeri çalan liste kapatsın — dolum (onlarca DB turu) yanıttan sonra.
    after(fillQueue(session.venue_id).catch(() => {}));
    return NextResponse.json({ ok: true });
  }

  const queueId = typeof body?.queue_id === "string" ? body.queue_id : "";
  if (!queueId || body?.status !== "removed") {
    return NextResponse.json({ error: "Eksik veya geçersiz alan" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("queue")
    .update({ status: "removed" })
    .eq("id", queueId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Sıralama: yalnızca otomatik blok (user_id null) kendi içinde taşınabilir.
// Müşterinin jetonla aldığı sıra satın alınmış bir haktır — admin onu kaydıramaz;
// zaten müşteri satırları position < 9000 olduğu için kuyruğun başında kalır.
export async function PUT(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const order: unknown = body?.order;
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Geçersiz sıralama" }, { status: 400 });
  }
  const ids = order as string[];
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Geçersiz sıralama" }, { status: 400 });
  }

  const { data: autoRows, error: readErr } = await supabaseAdmin
    .from("queue")
    .select("id, position")
    .eq("venue_id", session.venue_id)
    .eq("status", "queued")
    .is("user_id", null);

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  // İstemcinin gördüğü liste ile sunucudaki blok birebir aynı değilse (araya
  // otomatik dolum girmiş ya da müşteri satırı taşınmaya çalışılmış olabilir)
  // hiçbir şey yazılmaz — panel tazeleyip yeniden dener.
  const serverIds = new Set((autoRows ?? []).map((r) => r.id));
  if (serverIds.size !== ids.length || !ids.every((id) => serverIds.has(id))) {
    return NextResponse.json({ error: "Kuyruk değişti, sayfayı tazeleyin" }, { status: 409 });
  }

  // Yalnızca yeri DEĞİŞEN satırlar yazılır. Bir şarkıyı bir sıra aşağı almak iki
  // satır eder; eskiden kuyruğun tamamı (500 satıra kadar) her taşımada yeniden
  // yazılıyordu. Kuyruk satırlarında status/started_at gibi oynatıcının anlık
  // güncellediği alanlar olduğu için toplu upsert yerine hedefli UPDATE: yoldaki
  // bir satırı yanlışlıkla "queued"a geri çevirmeyelim.
  const currentPos = new Map((autoRows ?? []).map((r) => [r.id, r.position]));
  const results = await Promise.all(
    ids
      .map((id, i) => ({ id, position: AUTO_POSITION_BASE + 1 + i }))
      .filter(({ id, position }) => currentPos.get(id) !== position)
      .map(({ id, position }) =>
        supabaseAdmin
          .from("queue")
          .update({ position })
          .eq("id", id)
          .eq("venue_id", session.venue_id)
      )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
