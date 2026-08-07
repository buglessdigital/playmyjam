import { NextRequest, NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { nextQueuePosition, playPlaylistNow, resetAutoQueue } from "@/lib/queue-fill";

const MAX_NAME = 40;

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > MAX_NAME) return null;
  return name;
}

// Yeni playlist. Sıra dışında başlar — admin hazır olunca kuyruğa alır ya da
// play tuşuyla doğrudan çaldırır (queue_position null = sırada değil).
export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = parseName(body?.name);
  if (!name) {
    return NextResponse.json({ error: `Playlist adı gerekli (en fazla ${MAX_NAME} karakter)` }, { status: 400 });
  }

  const { data: last } = await supabaseAdmin
    .from("playlists")
    .select("sort_order")
    .eq("venue_id", session.venue_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("playlists")
    .insert({
      venue_id: session.venue_id,
      name,
      is_active: false,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id, name, sort_order, shuffle, queue_position, play_once")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Playlist oluşturulamadı" }, { status: 500 });
  }
  return NextResponse.json({ playlist: data });
}

// Yeniden adlandırma, kuyruğa alma/çıkarma, play, liste içi karıştırma; playlist_id
// olmadan da listelerin sırası. Kuyruk değişirse otomatik kuyruk tazelenir.
export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Playlist kuyruğunun sırası (0037): gelen dizi baştan sona queue_position olur.
  // Rotasyon imleci bilerek korunur — sıra değiştirmek çalan listeyi başa sarmaz,
  // yalnızca kimin ne zaman geleceğini değiştirir.
  if (body?.queue_order !== undefined) {
    const order = Array.isArray(body.queue_order)
      ? body.queue_order.filter((id: unknown): id is string => typeof id === "string")
      : null;
    if (!order || order.length === 0) {
      return NextResponse.json({ error: "Sıra listesi gerekli" }, { status: 400 });
    }

    const { data: owned } = await supabaseAdmin
      .from("playlists")
      .select("id")
      .eq("venue_id", session.venue_id)
      .in("id", order);

    if ((owned ?? []).length !== order.length) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    const results = await Promise.all(
      order.map((id: string, i: number) =>
        supabaseAdmin
          .from("playlists")
          .update({ queue_position: i + 1 })
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

  // Sırada olmayan listelerin raydaki görünüm sırası (çalmayı etkilemez)
  if (body?.order !== undefined) {
    const order = Array.isArray(body.order) ? body.order.filter((id: unknown) => typeof id === "string") : null;
    if (!order || order.length === 0) {
      return NextResponse.json({ error: "Sıra listesi gerekli" }, { status: 400 });
    }

    const { data: owned } = await supabaseAdmin
      .from("playlists")
      .select("id")
      .eq("venue_id", session.venue_id)
      .in("id", order);

    const ownedIds = new Set((owned ?? []).map((p) => p.id));
    if (ownedIds.size !== order.length) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    const results = await Promise.all(
      order.map((id: string, i: number) =>
        supabaseAdmin
          .from("playlists")
          .update({ sort_order: i })
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

  // Liste İÇİNDEKİ şarkı sırası: gelen song_id dizisi baştan sona position olur.
  // Sıralı listelerde çalma sırası budur; karışık listelerde yalnızca panel görünümü.
  if (body?.song_order !== undefined) {
    const listId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
    const songOrder: string[] | null = Array.isArray(body.song_order)
      ? body.song_order.filter((id: unknown): id is string => typeof id === "string")
      : null;
    if (!listId || !songOrder || songOrder.length === 0) {
      return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
    }

    // İki sorgu birbirine bağlı değil — sırayla değil birlikte gider
    const [{ data: playlist }, { data: members, error: membersErr }] = await Promise.all([
      supabaseAdmin
        .from("playlists")
        .select("id, queue_position, shuffle")
        .eq("id", listId)
        .eq("venue_id", session.venue_id)
        .maybeSingle(),
      supabaseAdmin
        .from("playlist_songs")
        .select("id, song_id, position")
        .eq("venue_id", session.venue_id)
        .eq("playlist_id", listId),
    ]);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }
    if (membersErr) {
      return NextResponse.json({ error: membersErr.message }, { status: 500 });
    }

    // Gelen dizi listenin tamamını birebir kapsamalı. Panel araya şarkı eklenmiş
    // eski bir görünümden sıra yollarsa yazmak yerine yenilenmesi istenir.
    const byId = new Map((members ?? []).map((m) => [m.song_id, m]));
    const unique = new Set(songOrder);
    if (
      unique.size !== songOrder.length ||
      songOrder.length !== byId.size ||
      songOrder.some((id: string) => !byId.has(id))
    ) {
      return NextResponse.json(
        { error: "Liste bu arada değişmiş — sayfayı yenileyip tekrar deneyin" },
        { status: 409 }
      );
    }

    // Yalnızca yeri değişen satırlar yazılır: tek adımlık taşımada iki satır eder.
    // Uzak bir noktaya sürüklemede aradaki tüm satırlar kayar, o yüzden yazma
    // öbekler halinde gider — büyük listede yüzlerce eşzamanlı istek olmasın.
    const changed = songOrder
      .map((songId, i) => ({ row: byId.get(songId)!, position: i + 1 }))
      .filter(({ row, position }) => row.position !== position)
      .map(({ row, position }) => ({ id: row.id, position }));

    for (let i = 0; i < changed.length; i += 25) {
      const results = await Promise.all(
        changed.slice(i, i + 25).map(({ id, position }) =>
          supabaseAdmin
            .from("playlist_songs")
            .update({ position })
            .eq("id", id)
            .eq("venue_id", session.venue_id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        return NextResponse.json({ error: failed.error.message }, { status: 500 });
      }
    }

    // Bekleyen otomatik şarkılar yeni sıraya göre yeniden seçilsin. Karışık
    // listede sıranın çalmaya etkisi yok, kuyruğu boşuna tazelemeyiz.
    // Yanıttan SONRA çalışır: panel sıra değişikliğini beklemeden görür, kuyruk
    // birkaç yüz ms sonra kendi kendine düzelir.
    if (changed.length > 0 && playlist.queue_position !== null && !playlist.shuffle) {
      after(resetAutoQueue(session.venue_id).catch(() => {}));
    }
    return NextResponse.json({ ok: true });
  }

  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  const hasName = body?.name !== undefined;
  const hasQueued = typeof body?.queued === "boolean";
  const hasPlayOnce = typeof body?.play_once === "boolean";
  const isPlay = body?.play === true;
  const hasAutoSync = typeof body?.auto_sync === "boolean";
  const hasShuffle = typeof body?.shuffle === "boolean";
  if (!playlistId || (!hasName && !hasQueued && !hasPlayOnce && !isPlay && !hasAutoSync && !hasShuffle)) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // Play: imleç bu listeye atlar, liste baştan başlar, bekleyen otomatik şarkılar
  // bu listeden yeniden seçilir. Sahnedeki şarkı ve müşteri istekleri korunur.
  if (isPlay) {
    const { data: playlist } = await supabaseAdmin
      .from("playlists")
      .select("id")
      .eq("id", playlistId)
      .eq("venue_id", session.venue_id)
      .maybeSingle();

    if (!playlist) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    const { count } = await supabaseAdmin
      .from("playlist_songs")
      .select("song_id", { count: "exact", head: true })
      .eq("venue_id", session.venue_id)
      .eq("playlist_id", playlistId);

    if (!count) {
      return NextResponse.json({ error: "Bu listede şarkı yok" }, { status: 400 });
    }

    await playPlaylistNow(session.venue_id, playlistId);
    return NextResponse.json({ ok: true });
  }

  // Kuyruğa alma / kuyruktan çıkarma. Sıraya eklemek çalanı değiştirmez: liste
  // kuyruğun sonuna girer ve sırası gelince çalar.
  if (hasQueued) {
    const position = body.queued ? await nextQueuePosition(session.venue_id) : null;

    const { data, error } = await supabaseAdmin
      .from("playlists")
      .update({ queue_position: position })
      .eq("id", playlistId)
      .eq("venue_id", session.venue_id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    // Kuyruktan çıkarmada bekleyen otomatik şarkılar tazelenir: o listenin
    // sıradaki şarkıları düşer, kuyruk kalan listelerden (ya da katalogdan) dolar.
    // Kuyruğa eklemede çalan hiçbir şey değişmez — TEK istisna kuyruğun boş
    // olduğu hal: o ana kadar katalogdan rastgele çalınıyordu, artık liste var.
    if (!body.queued || position === 1) {
      await resetAutoQueue(session.venue_id).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // Otomatik senkron anahtarı playlist_sources'ta durur — yalnızca YouTube'dan
  // içe aktarılmış listelerde satır vardır, elle kurulan listede açılamaz.
  if (hasAutoSync) {
    const { data: source, error: sourceErr } = await supabaseAdmin
      .from("playlist_sources")
      .update({
        auto_sync: body.auto_sync,
        // Yeniden açılırken hata sayacı sıfırlanır: liste tekrar herkese açık
        // yapılmış olabilir, 10 hatada kapanmış senkron böyle canlanır.
        ...(body.auto_sync ? { fail_count: 0, last_error: null, next_check_at: new Date().toISOString() } : {}),
      })
      .eq("playlist_id", playlistId)
      .eq("venue_id", session.venue_id)
      .select("playlist_id")
      .maybeSingle();

    if (sourceErr) {
      return NextResponse.json({ error: sourceErr.message }, { status: 500 });
    }
    if (!source) {
      return NextResponse.json(
        { error: "Bu liste YouTube'dan içe aktarılmadı — otomatik güncelleme açılamaz" },
        { status: 400 }
      );
    }
    if (!hasName && !hasPlayOnce && !hasShuffle) {
      return NextResponse.json({ ok: true });
    }
  }

  const patch: { name?: string; play_once?: boolean; shuffle?: boolean } = {};
  if (hasName) {
    const name = parseName(body.name);
    if (!name) {
      return NextResponse.json({ error: `Playlist adı gerekli (en fazla ${MAX_NAME} karakter)` }, { status: 400 });
    }
    patch.name = name;
  }
  if (hasPlayOnce) patch.play_once = body.play_once;
  if (hasShuffle) patch.shuffle = body.shuffle;

  const { data, error } = await supabaseAdmin
    .from("playlists")
    .update(patch)
    .eq("id", playlistId)
    .eq("venue_id", session.venue_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
  }

  // Liste içi sıra düzeni değişti: bekleyen otomatik şarkılar yeni düzene göre
  // yeniden seçilsin (tüketim de geri alınır, bkz. resetAutoQueue). play_once
  // yalnızca liste bitince devreye girer, kuyruğu şimdi tazelemeye gerek yok.
  if (hasShuffle) {
    await resetAutoQueue(session.venue_id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

// Playlist silme. Üyelikler cascade ile gider; hiçbir listede kalmayan şarkı
// 0026'daki trigger ile katalogdan da düşer.
export async function DELETE(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  if (!playlistId) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const { data: playlist } = await supabaseAdmin
    .from("playlists")
    .select("id, queue_position")
    .eq("id", playlistId)
    .eq("venue_id", session.venue_id)
    .maybeSingle();

  if (!playlist) {
    return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("playlists")
    .delete()
    .eq("id", playlistId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  if (playlist.queue_position !== null) {
    await resetAutoQueue(session.venue_id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
