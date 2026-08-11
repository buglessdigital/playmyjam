import { NextRequest, NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import {
  clearAutoQueue,
  fillQueueToTen,
  jumpPlaylistCursorTo,
  nextQueuePosition,
  pickPlaylistOpener,
  playPlaylistNow,
  resetAutoQueue,
} from "@/lib/queue-fill";
import { playSongNow } from "@/lib/queue";

const MAX_NAME = 40;

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > MAX_NAME) return null;
  return name;
}

// Yeni playlist. Sıra dışında başlar — admin hazır olunca kuyruğa alır ya da
// play tuşuyla doğrudan çaldırır (queue_position null = sırada değil).
// customer_visible kolonu varsayılan true: yeni liste müşteriye AÇIK doğar (0040).
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
    .select("id, name, sort_order, shuffle, queue_position, play_once, customer_visible")
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
    // Uzak bir noktaya sürüklemede aradaki tüm satırlar kayar — 500 şarkılık
    // listede başa çekmek 500 satır demek. Öbekler ARDIŞIK yazılırsa bu 20 tur
    // eder ve saniyeler sürer; öbekler paralel gider, yalnızca aynı anda uçan
    // istek sayısı sınırlanır (veritabanı bağlantı havuzu boğulmasın).
    const changed = songOrder
      .map((songId, i) => ({ row: byId.get(songId)!, position: i + 1 }))
      .filter(({ row, position }) => row.position !== position)
      .map(({ row, position }) => ({ id: row.id, position }));

    const WRITE_CONCURRENCY = 100;
    for (let i = 0; i < changed.length; i += WRITE_CONCURRENCY) {
      const results = await Promise.all(
        changed.slice(i, i + WRITE_CONCURRENCY).map(({ id, position }) =>
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
  const hasShuffle = typeof body?.shuffle === "boolean";
  // Müşteriye aktiflik (0040): yalnızca müşterinin görüp çaldırabileceğini
  // belirler, otomatik çalmayı hiç etkilemez.
  const hasCustomerVisible = typeof body?.customer_visible === "boolean";
  if (
    !playlistId ||
    (!hasName && !hasQueued && !hasPlayOnce && !isPlay && !hasShuffle && !hasCustomerVisible)
  ) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // Play: liste BAŞTAN ve HEMEN çalar. İmleç listeye atlar, ilerlemesi sıfırlanır,
  // listenin ilk şarkısı sahneye çıkar, kuyruk listenin devamıyla dolar.
  //
  // Tek istisna sahnedeki müşteri şarkısıdır: jetonla alınmış sıra yarıda
  // kesilmez. O halde sahne olduğu gibi kalır, liste yalnızca kuyruğa yazılır ve
  // müşteri istekleri bitince baştan çalmaya başlar. Sırada bekleyen müşteri
  // şarkıları da öne geçmeye devam eder (otomatik satırlar position 9000+).
  if (isPlay) {
    // YANIT SÜRESİ BURADA ÖNEMLİ: düğmeye basılınca şarkı hemen değişmeli.
    // O yüzden senkron kalan tek iş SAHNE (queue satırı + now_playing); imleç
    // taşıma, kuyruk temizliği ve dolum — hepsi onlarca DB turu — yanıttan sonra
    // after() içinde koşar ve panele Realtime ile düşer.
    //
    // Sahiplik, açılış şarkısı ve sahnedeki satır birbirine bağlı değil: hepsi
    // aynı anda sorulur.
    const [{ data: playlist }, opener, { data: playingRows }] = await Promise.all([
      supabaseAdmin
        .from("playlists")
        .select("id")
        .eq("id", playlistId)
        .eq("venue_id", session.venue_id)
        .maybeSingle(),
      pickPlaylistOpener(session.venue_id, playlistId),
      supabaseAdmin
        .from("queue")
        .select("song_id, user_id")
        .eq("venue_id", session.venue_id)
        .eq("status", "playing"),
    ]);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    // Açılış şarkısı yoksa listede çalınabilir şarkı da yok
    if (!opener) {
      return NextResponse.json({ error: "Bu listede çalınabilir şarkı yok" }, { status: 400 });
    }

    // Müşterinin jetonla aldığı sıra yarıda kesilmez; jetonsuz (otomatik ya da
    // adminin elle koyduğu) şarkı kesilir. Liste zaten açılış şarkısını
    // çalıyorsa da sahneye dokunulmaz — o şarkı yeniden baştan başlamasın.
    const stage = playingRows ?? [];
    const customerOnStage = stage.some((row) => row.user_id !== null);
    const openerOnStage = stage.some((row) => row.song_id === opener);
    const takeover = !customerOnStage && !openerOnStage;

    // Kuyruk işi tek zincir: liste baştan başlar (playPlaylistNow), bekleyen
    // otomatik satırlar düşer, kuyruk listenin başından dolar. Sıra şart —
    // temizlikten sonra dolum.
    //
    // Açılış şarkısı "çalındı" ancak fiilen sahnedeyse işaretlenir; müşteri
    // şarkısı kesilmediği için sahneye çıkamadıysa işaretlenmez, yoksa liste
    // sırası geldiğinde ilk şarkısını atlardı.
    const queueWork = async () => {
      await playPlaylistNow(session.venue_id, playlistId, { refillQueue: false });
      await clearAutoQueue(session.venue_id);
      if (!customerOnStage) await jumpPlaylistCursorTo(session.venue_id, playlistId, opener);
      await fillQueueToTen(session.venue_id);
    };

    if (!takeover) {
      after(queueWork().catch(() => {}));
      return NextResponse.json({ ok: true });
    }

    // Sahne devralınıyor. video_id yanıtla döner — panel player'a DB → Realtime
    // turunu beklemeden "bu videoyu yükle" der.
    const played = await playSongNow(
      session.venue_id,
      { songId: opener, playlistId },
      { deferQueueWork: true }
    );

    after(queueWork().catch(() => {}));
    return NextResponse.json({ ok: true, video_id: played.ok ? played.video_id : undefined });
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
    // Yanıttan SONRA: düğme dolumu beklemez.
    if (!body.queued || position === 1) {
      after(resetAutoQueue(session.venue_id).catch(() => {}));
    }
    return NextResponse.json({ ok: true });
  }

  const patch: { name?: string; play_once?: boolean; shuffle?: boolean; customer_visible?: boolean } = {};
  if (hasName) {
    const name = parseName(body.name);
    if (!name) {
      return NextResponse.json({ error: `Playlist adı gerekli (en fazla ${MAX_NAME} karakter)` }, { status: 400 });
    }
    patch.name = name;
  }
  if (hasPlayOnce) patch.play_once = body.play_once;
  if (hasShuffle) patch.shuffle = body.shuffle;
  if (hasCustomerVisible) patch.customer_visible = body.customer_visible;

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

  // Müşteri katalogu değişti: DB tarafındaki trigger venue_songs.playlist_visible'ı
  // yeniden hesapladı (0040), ama /venue/[id]/browse kabuğu cache'li — tag'i
  // düşürmezsek müşteri değişikliği ancak dakikalar sonra görür. Açık paneller
  // zaten venue_songs realtime'ıyla anında tazelenir. Kuyruk TAZELENMEZ: pasif
  // liste otomatik çalmaya devam eder.
  if (hasCustomerVisible) {
    revalidateTag(`venue-songs-${session.venue_id}`, "max");
  }

  // Liste içi sıra düzeni değişti: bekleyen otomatik şarkılar yeni düzene göre
  // yeniden seçilsin (tüketim de geri alınır, bkz. resetAutoQueue). play_once
  // yalnızca liste bitince devreye girer, kuyruğu şimdi tazelemeye gerek yok.
  if (hasShuffle) {
    after(resetAutoQueue(session.venue_id).catch(() => {}));
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
    after(resetAutoQueue(session.venue_id).catch(() => {}));
  }
  return NextResponse.json({ ok: true });
}
