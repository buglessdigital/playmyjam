import { supabaseAdmin } from "@/lib/supabase/admin";

const QUEUE_TARGET = 10;
export const AUTO_POSITION_BASE = 9000;
const COOLDOWN_MS = 30 * 60 * 1000;

// Kuyruktaki üç sınıf added_by ile ayrılır: müşteri satırlarında kullanıcı adı,
// otomatik dolumda "auto", adminin panelden elle eklediğinde "admin". İkincisi
// budanabilir, üçüncüsü budanamaz — admin bilerek koymuştur.
export const ADMIN_ADDED_BY = "admin";
const AUTO_ADDED_BY = "auto";

// Rotasyonun tuttuğu iki şey: hangi listedeyiz ve bu turda o listenin hangi
// şarkıları tüketildi (0032). Kuyruk 10 şarkılık bir pencere olduğu için
// "liste bitti" kuyruğa bakarak anlaşılamaz; ilerleme ayrı yaşar.
type RotationPick = { songId: string; playlistId: string };
type ConsumedRow = { playlist_id: string; song_id: string; cycle: number };

type EligibilityContext = {
  // Katalogda duran, müşteriye açık ve embed'e izin veren şarkılar
  catalogEligible: Set<string>;
  // Şu anda kuyrukta bekleyen / sahnede olan şarkılar — tekrar eklenemez
  excludeIds: Set<string>;
  // Son 30 dk içinde müşteri isteğiyle çalmış şarkılar (0025)
  cooldownIds: Set<string>;
};

function shuffleInPlace<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Aktif playlist seçimi değişince çağrılır: kuyrukta bekleyen OTOMATİK şarkılar
// (added_by='auto') düşer ve yeni havuzdan yeniden doldurulur. Müşterinin jeton
// harcayarak eklediği şarkılara, adminin elle eklediklerine ve sahnede çalana
// dokunulmaz.
export async function resetAutoQueue(venueId: string): Promise<void> {
  // Sıralı modda bu satırlar "tüketildi" diye işaretlenmişti; hiç çalmadan
  // düştükleri için tüketim de geri alınır, yoksa şarkılar bu turu ıskalar.
  const { data: pending } = await supabaseAdmin
    .from("queue")
    .select("id, song_id, source_playlist_id")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .eq("added_by", AUTO_ADDED_BY);

  await supabaseAdmin
    .from("queue")
    .update({ status: "removed" })
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .eq("added_by", AUTO_ADDED_BY);

  const sourced = (pending ?? []).filter((r) => r.source_playlist_id);
  if (sourced.length > 0) {
    const { data: state } = await supabaseAdmin
      .from("playlist_rotation")
      .select("cycle")
      .eq("venue_id", venueId)
      .maybeSingle();

    const cycle = state?.cycle ?? 1;
    const byList = new Map<string, string[]>();
    for (const row of sourced) {
      const list = byList.get(row.source_playlist_id!) ?? [];
      list.push(row.song_id);
      byList.set(row.source_playlist_id!, list);
    }

    await Promise.all(
      [...byList].map(([playlistId, songIds]) =>
        supabaseAdmin
          .from("playlist_rotation_consumed")
          .delete()
          .eq("venue_id", venueId)
          .eq("cycle", cycle)
          .eq("playlist_id", playlistId)
          .in("song_id", songIds)
      )
    );
  }

  await fillQueueToTen(venueId);
}

// Playlist kuyruğundan seçici (0037). Kuyruk = queue_position dolu listeler.
// İmlecin gösterdiği listede bu turda çalınmamış şarkı kaldığı sürece oradan
// seçer, tükenince kuyruktaki sıradakine geçer, sonuncu da bitince başa döner ve
// tur numarasını artırır — döngü hiç durmaz.
//
// Dönüş null ise "kuyrukta liste yok" demektir; boş/eksik dizi ise kuyruktakilerde
// şu an çalınabilir şarkı kalmamıştır (hepsi zaten kuyrukta ya da 30 dk kilidinde).
// Her iki durumda da çağıran taraf katalog yedeğine düşer, yani müzik susmaz.
async function pickFromRotation(
  venueId: string,
  needed: number,
  ctx: EligibilityContext
): Promise<RotationPick[] | null> {
  const { data: allLists } = await supabaseAdmin
    .from("playlists")
    .select("id, queue_position, play_once, shuffle, created_at")
    .eq("venue_id", venueId)
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const active = (allLists ?? []).filter((p) => p.queue_position !== null);
  if (active.length === 0) return null;

  const { data: state } = await supabaseAdmin
    .from("playlist_rotation")
    .select("playlist_id, cycle")
    .eq("venue_id", venueId)
    .maybeSingle();

  let cycle = state?.cycle ?? 1;
  const startCycle = cycle;
  let idx = 0;

  if (state?.playlist_id) {
    const found = active.findIndex((p) => p.id === state.playlist_id);
    // İmleçteki liste kuyruktan çıkarılmış ya da silinmişse kuyruğun başından
    // devam edilir; tur (cycle) ve diğer listelerin ilerlemesi bozulmaz.
    idx = found >= 0 ? found : 0;
  }

  const activeIds = active.map((p) => p.id);

  const [{ data: members }, { data: consumedRows }] = await Promise.all([
    supabaseAdmin
      .from("playlist_songs")
      .select("playlist_id, song_id, position, added_at")
      .eq("venue_id", venueId)
      .in("playlist_id", activeIds)
      .order("position", { ascending: true })
      .order("added_at", { ascending: true }),
    supabaseAdmin
      .from("playlist_rotation_consumed")
      .select("playlist_id, song_id")
      .eq("venue_id", venueId)
      .eq("cycle", cycle)
      .in("playlist_id", activeIds),
  ]);

  const songsByList = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = songsByList.get(m.playlist_id) ?? [];
    list.push(m.song_id);
    songsByList.set(m.playlist_id, list);
  }

  const consumedByList = new Map<string, Set<string>>();
  for (const c of consumedRows ?? []) {
    const set = consumedByList.get(c.playlist_id) ?? new Set<string>();
    set.add(c.song_id);
    consumedByList.set(c.playlist_id, set);
  }

  const picks: RotationPick[] = [];
  const consumed: ConsumedRow[] = [];
  const taken = new Set<string>();
  // Bir turunu bitiren "tek seferlik" listeler: bu çağrının sonunda kuyruktan
  // düşerler, o ana kadar da atlanırlar.
  const finishedOnce = new Set<string>();

  // Bu listede bu turda henüz çalınmamış şarkı var mı — tur artırma kararı buna bakar
  const hasRemaining = (playlistId: string) => {
    const seen = consumedByList.get(playlistId);
    return (songsByList.get(playlistId) ?? []).some((id) => !seen?.has(id));
  };

  // Emniyet tavanı: tüm listeler boşsa döngü iki tam turdan fazla dönmesin
  const maxSteps = active.length * 2 + 1;

  for (let step = 0; step < maxSteps && picks.length < needed; step++) {
    const playlist = active[idx];
    if (finishedOnce.has(playlist.id)) {
      idx += 1;
      if (idx >= active.length) idx = 0;
      continue;
    }

    const memberIds = songsByList.get(playlist.id) ?? [];
    const alreadyConsumed = consumedByList.get(playlist.id) ?? new Set<string>();
    consumedByList.set(playlist.id, alreadyConsumed);

    const remaining = memberIds.filter((id) => !alreadyConsumed.has(id));

    // Turunu tamamlamış tek seferlik liste: kuyruktan düşer, sıradakine geçilir.
    // Kuyruğu boş liste de burada elenir, yoksa hiç çalmadan sonsuza dek kalırdı.
    if (remaining.length === 0 && playlist.play_once) {
      finishedOnce.add(playlist.id);
      idx += 1;
      if (idx >= active.length) idx = 0;
      continue;
    }

    // Kalıcı olarak çalınamaz olanlar (katalogdan düşmüş, gizlenmiş ya da embed'e
    // kapalı) turu kilitlemesin diye tüketilmiş sayılır.
    for (const id of remaining) {
      if (!ctx.catalogEligible.has(id)) {
        alreadyConsumed.add(id);
        consumed.push({ playlist_id: playlist.id, song_id: id, cycle });
      }
    }

    // Kuyrukta bekleyen / sahnedeki şarkı şimdilik eklenemez ama TÜKETİLMEZ:
    // müşteri istediği için orada olabilir, rotasyonun ilerlemesini bozmaz.
    let candidates = remaining.filter(
      (id) => ctx.catalogEligible.has(id) && !ctx.excludeIds.has(id) && !taken.has(id)
    );
    if (playlist.shuffle) candidates = shuffleInPlace(candidates);

    // 30 dk kilidindekiler bu turda atlanır (tüketilmez; tur başa dönünce
    // kendiliğinden yeniden uygun olurlar)
    for (const id of candidates) {
      if (picks.length >= needed) break;
      if (ctx.cooldownIds.has(id)) continue;
      picks.push({ songId: id, playlistId: playlist.id });
      taken.add(id);
      alreadyConsumed.add(id);
      consumed.push({ playlist_id: playlist.id, song_id: id, cycle });
    }

    if (picks.length >= needed) break;

    // Bu listede seçilebilir şarkı kalmadı → sıradaki liste
    idx += 1;
    if (idx >= active.length) {
      idx = 0;
      // Kuyruk başa döndü. Tur ancak kuyruktaki TÜM listeler gerçekten tükendiyse
      // artar: şarkıları yalnızca şu an çalınamaz olduğu için (kuyrukta bekliyor
      // ya da 30 dk kilidinde) atlanan listenin ilerlemesi silinmemeli.
      const exhausted = active.every((p) => finishedOnce.has(p.id) || !hasRemaining(p.id));
      if (exhausted) {
        cycle += 1;
        // Yeni tur: tüketim sıfırlanır. taken KORUNUR — o yalnızca bu dolumda aynı
        // şarkının iki kez kuyruğa yazılmasını engelliyor; tur değişimi bunu
        // serbest bırakırsa aynı satır iki kez eklenir.
        consumedByList.clear();
      }
    }
  }

  // Tur döndüyse eski turun tüketim satırları gider; yalnızca güncel tura ait
  // olanlar yazılır (eskiler nasılsa silinecek).
  if (cycle !== startCycle) {
    await supabaseAdmin
      .from("playlist_rotation_consumed")
      .delete()
      .eq("venue_id", venueId)
      .lt("cycle", cycle);
  }

  const fresh = consumed.filter((c) => c.cycle === cycle);
  if (fresh.length > 0) {
    await supabaseAdmin.from("playlist_rotation_consumed").upsert(
      fresh.map((c) => ({ venue_id: venueId, playlist_id: c.playlist_id, song_id: c.song_id, cycle: c.cycle })),
      { onConflict: "venue_id,playlist_id,cycle,song_id", ignoreDuplicates: true }
    );
  }

  // Turunu bitiren tek seferlik listeler kuyruktan düşer. Liste silinmez, yalnızca
  // sıradan çıkar — mekan isterse tekrar sıraya alır.
  if (finishedOnce.size > 0) {
    await supabaseAdmin
      .from("playlists")
      .update({ queue_position: null })
      .eq("venue_id", venueId)
      .in("id", [...finishedOnce]);

    // İlerlemesi de silinir: liste sonradan tekrar sıraya alınırsa "zaten bitmiş"
    // sayılıp anında düşmesin, baştan çalsın.
    await supabaseAdmin
      .from("playlist_rotation_consumed")
      .delete()
      .eq("venue_id", venueId)
      .in("playlist_id", [...finishedOnce]);
  }

  // İmleç: kuyrukta kalan ilk listeye oturur. Kuyruk tamamen boşaldıysa null —
  // bir sonraki dolum katalog yedeğine düşer.
  let cursor: string | null = null;
  for (let i = 0; i < active.length; i++) {
    const candidate = active[(idx + i) % active.length];
    if (!finishedOnce.has(candidate.id)) {
      cursor = candidate.id;
      break;
    }
  }

  await supabaseAdmin.from("playlist_rotation").upsert(
    {
      venue_id: venueId,
      playlist_id: cursor,
      cycle,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id" }
  );

  return picks;
}

export async function fillQueueToTen(venueId: string): Promise<void> {
  // Current queued count (playing is separate status, not counted)
  const { count: totalQueued } = await supabaseAdmin
    .from("queue")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .eq("status", "queued");

  const current = totalQueued ?? 0;

  // If over target, trim excess auto-fill songs (customer songs are never removed
  // here; adminin elle eklediği satırlar da korunur — added_by filtresi)
  if (current > QUEUE_TARGET) {
    const excess = current - QUEUE_TARGET;
    const { data: autoFills } = await supabaseAdmin
      .from("queue")
      .select("id")
      .eq("venue_id", venueId)
      .eq("status", "queued")
      .is("user_id", null)
      .eq("added_by", AUTO_ADDED_BY)
      .order("position", { ascending: false })
      .limit(excess);

    if (autoFills?.length) {
      await supabaseAdmin
        .from("queue")
        .update({ status: "removed" })
        .in("id", autoFills.map((r) => r.id));
    }
    return;
  }

  const needed = QUEUE_TARGET - current;
  if (needed <= 0) return;

  // Song IDs already in queue — don't add duplicates
  const { data: currentQueue } = await supabaseAdmin
    .from("queue")
    .select("song_id")
    .eq("venue_id", venueId)
    .eq("status", "queued");

  const inQueueIds = new Set((currentQueue ?? []).map((r) => r.song_id));

  // Exclude the currently playing song
  const { data: playingNow } = await supabaseAdmin
    .from("queue")
    .select("song_id, user_id")
    .eq("venue_id", venueId)
    .eq("status", "playing")
    .limit(1)
    .maybeSingle();

  const excludeIds = new Set(inQueueIds);
  if (playingNow?.song_id) excludeIds.add(playingNow.song_id);

  // 30 dk kuralı "eklenemez" değil "çalmaz": müşteri isteğiyle son 30 dk içinde
  // çalmaya başlamış şarkılar otomatik doldurmaya da girmez. auto-fill'in kendi
  // çaldıkları bu kurala girmez (user_id null) — onlar hemen tekrar seçilebilir.
  // played_at hep started_at'ten sonra olduğu için played_at filtresi üst küme;
  // asıl çapa (başlangıç anı) burada süzülür.
  const cutoff = Date.now() - COOLDOWN_MS;
  const { data: recentUserPlays } = await supabaseAdmin
    .from("queue")
    .select("song_id, started_at, played_at")
    .eq("venue_id", venueId)
    .eq("status", "played")
    .not("user_id", "is", null)
    .gte("played_at", new Date(cutoff).toISOString());

  const cooldownIds = new Set(
    (recentUserPlays ?? [])
      .filter((r) => new Date(r.started_at ?? r.played_at).getTime() >= cutoff)
      .map((r) => r.song_id)
  );
  // Çalmakta olan müşteri şarkısı da kilitli (zaten excludeIds'de ama bittiğinde
  // bir sonraki dolumda played satırı üzerinden yakalanır)
  if (playingNow?.user_id && playingNow.song_id) cooldownIds.add(playingNow.song_id);

  // Çalınabilir katalog: çalınamaz işaretlenen (embed kapalı) ve müşteriye
  // kapatılmış şarkılar girmez.
  const { data: venueSongs } = await supabaseAdmin
    .from("venue_songs")
    .select("song_id, songs!inner(embeddable)")
    .eq("venue_id", venueId)
    .eq("in_venue_list", true)
    .eq("songs.embeddable", true);

  // Otomatik çalma önce playlist kuyruğundan geçer (0037): sıraya alınmış listeler
  // queue_position sırasıyla tüketilir, sonuncu bitince başa dönülür.
  const catalogEligible = new Set((venueSongs ?? []).map((vs) => vs.song_id));
  const rotationPicks =
    (await pickFromRotation(venueId, needed, { catalogEligible, excludeIds, cooldownIds })) ?? [];

  const picks: { songId: string; playlistId: string | null }[] = [...rotationPicks];

  // Kuyrukta liste yoksa — ya da kuyruktakilerden şu an yeterince şarkı
  // çıkmadıysa (hepsi kuyrukta bekliyor / 30 dk kilidinde) — kalan boşluk tüm
  // katalogdan karışık doldurulur. Bunlar source_playlist_id'siz girer ve
  // "tüketilmiş" sayılmaz: kilit açılınca liste kaldığı yerden devam eder.
  if (picks.length < needed) {
    const alreadyPicked = new Set(picks.map((p) => p.songId));
    const eligible = (venueSongs ?? [])
      .map((vs) => vs.song_id)
      .filter((id) => !excludeIds.has(id) && !alreadyPicked.has(id));

    // Cooldown'daki şarkılar elenir; ama katalog küçük olup hepsi elenirse müzik
    // susmasın diye cooldown yok sayılır (kuyruğa/sahneye çıkma engeli hep geçerli)
    const fresh = eligible.filter((id) => !cooldownIds.has(id));
    const candidates = fresh.length > 0 ? fresh : eligible;

    shuffleInPlace(candidates);
    for (const songId of candidates.slice(0, needed - picks.length)) {
      picks.push({ songId, playlistId: null });
    }
  }

  await insertAutoRows(venueId, picks);
}

// Paneldeki play tuşu: imleç bu listeye atlar ve liste baştan başlar.
//
// O ana kadar çalmakta olan liste KUYRUKTAN DÜŞER: sırası gelmiş, çalmış ve elle
// kesilmiştir — kuyrukta kalsaydı yeni liste bitince tekrar en başa gelirdi.
// Böylece "A çalıyor, B sırada" iken C'ye basılınca C çalar ve arkasından B gelir.
// Düşen liste silinmez, yalnızca sıradan çıkar; mekan isterse tekrar sıraya alır.
//
// Kuyrukta kalanların sırası korunur, yalnızca 1..n olarak sıkıştırılır.
// Liste kuyrukta değilse önce kuyruğa alınır: play "sıraya ekle + şimdi çal".
export async function playPlaylistNow(venueId: string, playlistId: string): Promise<void> {
  const [{ data: playlist }, { data: state }, { data: queued }] = await Promise.all([
    supabaseAdmin
      .from("playlists")
      .select("id, queue_position")
      .eq("id", playlistId)
      .eq("venue_id", venueId)
      .maybeSingle(),
    supabaseAdmin
      .from("playlist_rotation")
      .select("playlist_id, cycle")
      .eq("venue_id", venueId)
      .maybeSingle(),
    supabaseAdmin
      .from("playlists")
      .select("id, queue_position")
      .eq("venue_id", venueId)
      .not("queue_position", "is", null)
      .order("queue_position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (!playlist) return;

  const cycle = state?.cycle ?? 1;
  const queue = queued ?? [];

  // Şu an çalan liste: imleçteki liste kuyruktaysa o, değilse (imleç boş ya da
  // liste kuyruktan çıkmış) dolum kuyruğun başından başlayacağı için ilk liste.
  const playing = queue.find((p) => p.id === state?.playlist_id) ?? queue[0] ?? null;
  const dropId = playing && playing.id !== playlistId ? playing.id : null;

  // Kalan kuyruk + hedef: hedef zaten kuyruktaysa yerinde kalır, değilse sona girer
  const remaining = queue.filter((p) => p.id !== dropId);
  if (!remaining.some((p) => p.id === playlistId)) {
    remaining.push({ id: playlistId, queue_position: Number.MAX_SAFE_INTEGER });
  }

  await Promise.all([
    ...remaining
      .map((p, i) => ({ id: p.id, position: i + 1, current: p.queue_position }))
      .filter((p) => p.current !== p.position)
      .map((p) =>
        supabaseAdmin
          .from("playlists")
          .update({ queue_position: p.position })
          .eq("id", p.id)
          .eq("venue_id", venueId)
      ),
    ...(dropId
      ? [
          supabaseAdmin
            .from("playlists")
            .update({ queue_position: null })
            .eq("id", dropId)
            .eq("venue_id", venueId),
          // İlerlemesi de silinir: sonradan tekrar sıraya alınırsa kaldığı yerden
          // değil baştan çalsın (play_once'ta olduğu gibi).
          supabaseAdmin
            .from("playlist_rotation_consumed")
            .delete()
            .eq("venue_id", venueId)
            .eq("playlist_id", dropId),
        ]
      : []),
  ]);

  // Liste baştan çalsın: bu turda tüketilmiş sayılan şarkıları serbest bırak.
  await supabaseAdmin
    .from("playlist_rotation_consumed")
    .delete()
    .eq("venue_id", venueId)
    .eq("cycle", cycle)
    .eq("playlist_id", playlistId);

  await supabaseAdmin.from("playlist_rotation").upsert(
    { venue_id: venueId, playlist_id: playlistId, cycle, updated_at: new Date().toISOString() },
    { onConflict: "venue_id" }
  );

  // Kuyrukta bekleyen otomatik şarkılar yeni listeden yeniden seçilir. Sahnede
  // çalan şarkıya, müşteri isteklerine ve adminin elle eklediklerine dokunulmaz —
  // yani hiçbir şarkı yarıda kesilmez, sıradaki şarkıdan itibaren bu liste çalar.
  await resetAutoQueue(venueId);
}

// Kuyruğun sonundaki yer. Kuyruk boşsa 1'den başlar.
export async function nextQueuePosition(venueId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("playlists")
    .select("queue_position")
    .eq("venue_id", venueId)
    .not("queue_position", "is", null)
    .order("queue_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.queue_position ?? 0) + 1;
}

// Seçilen şarkıları kuyruğun otomatik bölümüne yazar. Konum, mevcut en yüksek
// otomatik satırın üstünden devam eder — müşteri satırlarıyla çakışmasın diye
// taban AUTO_POSITION_BASE.
async function insertAutoRows(
  venueId: string,
  picks: { songId: string; playlistId: string | null }[]
): Promise<void> {
  if (picks.length === 0) return;

  const { data: lastAuto } = await supabaseAdmin
    .from("queue")
    .select("position")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startPos = Math.max(lastAuto?.position ?? AUTO_POSITION_BASE, AUTO_POSITION_BASE) + 1;

  await supabaseAdmin.from("queue").insert(
    picks.map((pick, i) => ({
      venue_id: venueId,
      song_id: pick.songId,
      user_id: null,
      added_by: AUTO_ADDED_BY,
      tokens_spent: 0,
      priority: false,
      position: startPos + i,
      status: "queued",
      source_playlist_id: pick.playlistId,
    }))
  );
}
