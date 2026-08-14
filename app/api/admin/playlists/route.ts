import { NextRequest, NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import {
  clearManualQueue,
  enqueueManual,
  fillQueue,
  pickPlaylistOpener,
  playlistSongsForQueue,
  resetAutoQueue,
  startPlaylistFrom,
  verifyPlaylistOpener,
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
    .select("id, name, sort_order, shuffle, queue_position, customer_visible")
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
      .select("id, queue_position")
      .eq("venue_id", session.venue_id)
      .in("id", order);

    if ((owned ?? []).length !== order.length) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    // Yalnızca yeri değişenler yazılır: bir listeyi bir sıra yukarı almak iki
    // satır eder, tüm rayı baştan yazmak değil.
    const currentPos = new Map((owned ?? []).map((p) => [p.id, p.queue_position]));
    const results = await Promise.all(
      order
        .map((id: string, i: number): { id: string; position: number } => ({ id, position: i + 1 }))
        .filter(({ id, position }: { id: string; position: number }) => currentPos.get(id) !== position)
        .map(({ id, position }: { id: string; position: number }) =>
          supabaseAdmin
            .from("playlists")
            .update({ queue_position: position })
            .eq("id", id)
            .eq("venue_id", session.venue_id)
        )
    );

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    // Kuyruk artık listelerin sonuna kadar YAZILI olduğu için sıra değişikliği
    // tek başına yetmez: bekleyen otomatik satırlar yeni sıraya göre yeniden
    // kurulur. Sahnedeki şarkıya, müşteri isteklerine ve adminin elle
    // eklediklerine dokunulmaz; çalınmış şarkılar çalınmış kalır.
    after(resetAutoQueue(session.venue_id).catch(() => {}));
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
      .select("id, sort_order")
      .eq("venue_id", session.venue_id)
      .in("id", order);

    const ownedIds = new Set((owned ?? []).map((p) => p.id));
    if (ownedIds.size !== order.length) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    const currentOrder = new Map((owned ?? []).map((p) => [p.id, p.sort_order]));
    const results = await Promise.all(
      order
        .map((id: string, i: number): { id: string; sortOrder: number } => ({ id, sortOrder: i }))
        .filter(({ id, sortOrder }: { id: string; sortOrder: number }) => currentOrder.get(id) !== sortOrder)
        .map(({ id, sortOrder }: { id: string; sortOrder: number }) =>
          supabaseAdmin
            .from("playlists")
            .update({ sort_order: sortOrder })
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
    // listede başa çekmek 500 satır demek. Bunlar eskiden satır başına AYRI birer
    // UPDATE isteğiydi (100'lük öbekler halinde); tek upsert'e indirildi, yani
    // kaç satır kayarsa kaysın veritabanına tek tur gidiliyor.
    const changed = songOrder
      .map((songId, i) => ({ songId, position: i + 1 }))
      .filter(({ songId, position }) => byId.get(songId)!.position !== position);

    if (changed.length > 0) {
      const { error: writeErr } = await supabaseAdmin.from("playlist_songs").upsert(
        changed.map(({ songId, position }) => ({
          venue_id: session.venue_id,
          playlist_id: listId,
          song_id: songId,
          position,
        })),
        { onConflict: "playlist_id,song_id" }
      );
      if (writeErr) {
        return NextResponse.json({ error: writeErr.message }, { status: 500 });
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
  const isPlay = body?.play === true;
  const hasShuffle = typeof body?.shuffle === "boolean";
  // Müşteriye aktiflik (0040): yalnızca müşterinin görüp çaldırabileceğini
  // belirler, otomatik çalmayı hiç etkilemez.
  const hasCustomerVisible = typeof body?.customer_visible === "boolean";
  if (
    !playlistId ||
    (!hasName && !hasQueued && !isPlay && !hasShuffle && !hasCustomerVisible)
  ) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // Play: liste BAŞTAN ve HEMEN çalar. İmleç listeye atlar, ilerlemesi sıfırlanır,
  // listenin ilk şarkısı sahneye çıkar, kuyruk listenin devamıyla dolar.
  //
  // İki istisna sahneyi devralmayı engeller, ikisi de müşterinin jetonla aldığı
  // sırayı korumak için:
  //  1) Sahnede müşteri şarkısı çalıyorsa yarıda kesilmez.
  //  2) Sahnede jetonsuz (otomatik/admin) bir şarkı çalarken sırada bekleyen
  //     müşteri şarkısı varsa, sahneyi liste değil o müşteri şarkısı devralır —
  //     müşteri istekleri sırayla çalar, liste onların altından baştan başlar.
  // Her iki durumda da liste yalnızca kuyruğa yazılır (otomatik satırlar
  // position 9000+, yani müşteri şarkıları öne geçmeye devam eder).
  if (isPlay) {
    // YANIT SÜRESİ BURADA ÖNEMLİ: düğmeye basılınca şarkı hemen değişmeli.
    // O yüzden senkron kalan tek iş SAHNE (queue satırı + now_playing); imleç
    // taşıma, kuyruk temizliği ve dolum — hepsi onlarca DB turu — yanıttan sonra
    // after() içinde koşar ve panele Realtime ile düşer.
    //
    // Sahiplik, açılış şarkısı, sahnedeki satır ve sıradaki müşteri şarkısı
    // birbirine bağlı değil: hepsi aynı anda sorulur.
    // Panel hangi şarkının açacağını biliyor (listenin sırası ekranında duruyor)
    // ve bunu ipucu olarak yollar: doğrulaması iki ucuz sorgu, listenin tamamını
    // çekip elemekten belirgin biçimde hızlı. Panel bu ipucuyla aynı anda
    // player'a "bu videoyu yükle" dediği için ses sunucu turunu beklemez.
    const openerHint = typeof body?.opener_song_id === "string" ? body.opener_song_id : null;

    const [{ data: playlist }, hintedOpener, { data: playingRows }, { data: nextCustomerRow }] =
      await Promise.all([
        supabaseAdmin
          .from("playlists")
          .select("id")
          .eq("id", playlistId)
          .eq("venue_id", session.venue_id)
          .maybeSingle(),
        openerHint
          ? verifyPlaylistOpener(session.venue_id, playlistId, openerHint)
          : pickPlaylistOpener(session.venue_id, playlistId),
        supabaseAdmin
          .from("queue")
          .select("song_id, user_id")
          .eq("venue_id", session.venue_id)
          .eq("status", "playing"),
        // Sıradaki ilk müşteri şarkısı — sıralama playNextFromQueue ile birebir
        // aynı, yoksa "sıradaki" başka bir şarkı olurdu
        supabaseAdmin
          .from("queue")
          .select("id")
          .eq("venue_id", session.venue_id)
          .eq("status", "queued")
          .not("user_id", "is", null)
          .order("priority", { ascending: false })
          .order("position", { ascending: true })
          .order("added_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    // İpucu tutmadıysa (şarkı listeden çıkmış, çalınamaz işaretlenmiş ya da
    // panelin görünümü bayat) normal seçime düşülür.
    const opener =
      hintedOpener ?? (openerHint ? await pickPlaylistOpener(session.venue_id, playlistId) : null);

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
    // Jetonsuz şarkı çalarken sırada müşteri şarkısı bekliyorsa sahne ona geçer:
    // liste sıranın önüne geçemez, müşteri isteklerinin altından başlar.
    const promoteId = !customerOnStage ? nextCustomerRow?.id ?? null : null;
    const takeover = !customerOnStage && !openerOnStage && !promoteId;

    // Kuyruk işi tek zincir: liste baştan başlar (playPlaylistNow), bekleyen
    // otomatik satırlar düşer, kuyruk listenin başından dolar. Sıra şart —
    // temizlikten sonra dolum.
    //
    // Açılış şarkısı "çalındı" ancak fiilen sahnedeyse işaretlenir; sahneyi
    // müşteri şarkısı tuttuğu için çıkamadıysa işaretlenmez, yoksa liste sırası
    // geldiğinde ilk şarkısını atlardı.
    const openerReachedStage = !customerOnStage && !promoteId;
    // Kuyruk işi İKİ AŞAMADA: önce kısa yol (listeyi devret + kuyruğun başını
    // yaz — iki DB turu), sonra geri kalanı. Eskiden bu iş otuza yakın ardışık
    // tur ediyor ve panelde sıra 8-9 saniye sonra beliriyordu.
    const queueWork = async () => {
      await startPlaylistFrom(session.venue_id, playlistId, openerReachedStage ? opener : null);
      await fillQueue(session.venue_id);
    };

    // Sahneyi müşteri şarkısı devralıyor: sahnedeki jetonsuz şarkı kapanır,
    // sıradaki ilk müşteri satırı çalmaya başlar. İmleç yine listeye taşınır ama
    // listenin ilk şarkısı tüketilmez — müşteri istekleri bitince o çalacak.
    if (promoteId) {
      const promoted = await playSongNow(
        session.venue_id,
        { queueId: promoteId },
        { deferQueueWork: true }
      );

      after(queueWork().catch(() => {}));
      return NextResponse.json({
        ok: true,
        video_id: promoted.ok ? promoted.video_id : undefined,
      });
    }

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

  // "Sıraya ekle" / "Sıradan çıkar" (Spotify mantığı): liste tek blok halinde
  // ÇALAN ŞARKIDAN HEMEN SONRAYA girer. Çalan liste kesilmez, sadece bekler ve
  // blok bitince kaldığı yerden devam eder — rotasyona (queue_position)
  // dokunulmaz, listenin ilerlemesi tüketilmiş sayılmaz.
  if (hasQueued) {
    const { data: playlist } = await supabaseAdmin
      .from("playlists")
      .select("id, queue_position")
      .eq("id", playlistId)
      .eq("venue_id", session.venue_id)
      .maybeSingle();

    if (!playlist) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    if (body.queued) {
      const songIds = await playlistSongsForQueue(session.venue_id, playlistId);
      if (songIds.length === 0) {
        return NextResponse.json({ error: "Bu listede çalınabilir şarkı yok" }, { status: 409 });
      }
      const added = await enqueueManual(session.venue_id, songIds, playlistId);
      return NextResponse.json({ ok: true, added });
    }

    // Sıradan çıkarma: bu listeden elle eklenmiş satırlar düşer. Liste aynı
    // zamanda ÇALAN liste ise (queue_position dolu) otomatik çalması da durur —
    // "bu listeyi tamamen sıradan çıkar" beklentisi budur.
    await clearManualQueue(session.venue_id, playlistId);
    if (playlist.queue_position !== null) {
      await supabaseAdmin
        .from("playlists")
        .update({ queue_position: null })
        .eq("id", playlistId)
        .eq("venue_id", session.venue_id);
      after(resetAutoQueue(session.venue_id).catch(() => {}));
    } else {
      after(fillQueue(session.venue_id).catch(() => {}));
    }
    return NextResponse.json({ ok: true });
  }

  const patch: { name?: string; shuffle?: boolean; customer_visible?: boolean } = {};
  if (hasName) {
    const name = parseName(body.name);
    if (!name) {
      return NextResponse.json({ error: `Playlist adı gerekli (en fazla ${MAX_NAME} karakter)` }, { status: 400 });
    }
    patch.name = name;
  }
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
  // yeniden seçilsin (tüketim de geri alınır, bkz. resetAutoQueue).
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
