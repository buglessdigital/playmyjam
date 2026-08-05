import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { parseSongInput } from "@/lib/validate";
import { ADMIN_ADDED_BY, AUTO_POSITION_BASE } from "@/lib/queue-fill";

// Adminin kuyruğa doğrudan eklediği şarkı, otomatik çalanlarla aynı sınıftadır:
// user_id null (jeton harcanmaz, 30 dk kilidi doğurmaz, müşteri şarkılarının
// arkasında çalar). Tek farkı added_by='admin' — otomatik dolum kendi eklediğini
// buduyor, adminin bilerek eklediğine dokunmuyor (bkz. lib/queue-fill.ts).
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

  // Sahnedeki ya da sırada bekleyen şarkı ikinci kez eklenmez
  const { data: existing } = await supabaseAdmin
    .from("queue")
    .select("status")
    .eq("venue_id", session.venue_id)
    .eq("song_id", songRow.id)
    .in("status", ["queued", "playing"])
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: existing.status === "playing" ? "Bu şarkı şu an çalıyor" : "Bu şarkı zaten sırada" },
      { status: 409 }
    );
  }

  // Otomatik bloğun sonuna eklenir; admin sonrasında sürükleyerek öne alabilir
  const { data: lastAuto } = await supabaseAdmin
    .from("queue")
    .select("position")
    .eq("venue_id", session.venue_id)
    .eq("status", "queued")
    .is("user_id", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = Math.max(lastAuto?.position ?? AUTO_POSITION_BASE, AUTO_POSITION_BASE) + 1;

  const { error } = await supabaseAdmin.from("queue").insert({
    venue_id: session.venue_id,
    song_id: songRow.id,
    user_id: null,
    added_by: ADMIN_ADDED_BY,
    tokens_spent: 0,
    priority: false,
    position,
    status: "queued",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, song_id: songRow.id });
}

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
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
    .select("id")
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

  const results = await Promise.all(
    ids.map((id, i) =>
      supabaseAdmin
        .from("queue")
        .update({ position: AUTO_POSITION_BASE + 1 + i })
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
