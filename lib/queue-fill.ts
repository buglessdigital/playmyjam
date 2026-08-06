import { supabaseAdmin } from "@/lib/supabase/admin";

const QUEUE_TARGET = 10;
export const AUTO_POSITION_BASE = 9000;
const COOLDOWN_MS = 30 * 60 * 1000;

// Kuyruktaki üç sınıf added_by ile ayrılır: müşteri satırlarında kullanıcı adı,
// otomatik dolumda "auto", adminin panelden elle eklediğinde "admin". İkincisi
// budanabilir, üçüncüsü budanamaz — admin bilerek koymuştur.
export const ADMIN_ADDED_BY = "admin";
const AUTO_ADDED_BY = "auto";

// Aktif playlist'lerin şarkı kimlikleri. Hiç aktif playlist yoksa null döner:
// çağıran taraf bunu "havuz = tüm katalog" diye okur, böylece admin tüm listeleri
// pasife çekse bile müzik susmaz.
async function getActivePlaylistSongIds(venueId: string): Promise<Set<string> | null> {
  const { data: activePlaylists } = await supabaseAdmin
    .from("playlists")
    .select("id")
    .eq("venue_id", venueId)
    .eq("is_active", true);

  const ids = (activePlaylists ?? []).map((p) => p.id);
  if (ids.length === 0) return null;

  const { data: members } = await supabaseAdmin
    .from("playlist_songs")
    .select("song_id")
    .eq("venue_id", venueId)
    .in("playlist_id", ids);

  return new Set((members ?? []).map((m) => m.song_id));
}

// Sıralı modda (0032) rotasyonun tuttuğu iki şey: hangi listedeyiz ve bu turda
// o listenin hangi şarkıları tüketildi. Kuyruk 10 şarkılık bir pencere olduğu
// için "liste bitti" kuyruğa bakarak anlaşılamaz; ilerleme ayrı yaşar.
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

// Sıralı mod seçici. Aktif listeleri sort_order sırasıyla tüketir: baştaki listede
// bu turda çalınmamış şarkı kaldığı sürece oradan seçer, tükenince sıradakine
// geçer, sonuncu da bitince başa döner ve tur numarasını artırır.
//
// Dönüş null ise "aktif playlist yok" demektir — çağıran taraf karışık moddaki
// gibi tüm kataloga düşer, yani müzik hiçbir koşulda susmaz. Boş dizi ise aktif
// listelerde şu an çalınabilir şarkı kalmamıştır; orada da katalog yedeği devreye
// girer.
async function pickFromRotation(
  venueId: string,
  needed: number,
  ctx: EligibilityContext
): Promise<RotationPick[] | null> {
  const { data: allLists } = await supabaseAdmin
    .from("playlists")
    .select("id, is_active, sort_order, shuffle, created_at")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const active = (allLists ?? []).filter((p) => p.is_active);
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
    if (found >= 0) {
      idx = found;
    } else {
      // İmleçteki liste pasife alınmış ya da silinmiş: sıradaki aktif listeye
      // geçilir (sırada kimse yoksa başa dönülür), tur bozulmaz.
      const previous = (allLists ?? []).find((p) => p.id === state.playlist_id);
      const after = previous ? active.findIndex((p) => p.sort_order >= previous.sort_order) : -1;
      idx = after >= 0 ? after : 0;
    }
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

  // Emniyet tavanı: tüm listeler boşsa döngü iki tam turdan fazla dönmesin
  const maxSteps = active.length * 2 + 1;

  for (let step = 0; step < maxSteps && picks.length < needed; step++) {
    const playlist = active[idx];
    const memberIds = songsByList.get(playlist.id) ?? [];
    const alreadyConsumed = consumedByList.get(playlist.id) ?? new Set<string>();
    consumedByList.set(playlist.id, alreadyConsumed);

    const remaining = memberIds.filter((id) => !alreadyConsumed.has(id));

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
      cycle += 1;
      // Yeni tur: tüketim sıfırlanır. taken KORUNUR — o yalnızca bu dolumda aynı
      // şarkının iki kez kuyruğa yazılmasını engelliyor; tur değişimi bunu
      // serbest bırakırsa aynı satır iki kez eklenir.
      consumedByList.clear();
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

  await supabaseAdmin.from("playlist_rotation").upsert(
    {
      venue_id: venueId,
      playlist_id: active[idx].id,
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

  // Otomatik çalma havuzu = AKTİF playlist'lerdeki şarkılar (0026).
  // Çalınamaz işaretlenen (embed kapalı) ve müşteriye kapatılmış şarkılar girmez.
  const { data: venueSongs } = await supabaseAdmin
    .from("venue_songs")
    .select("song_id, songs!inner(embeddable)")
    .eq("venue_id", venueId)
    .eq("in_venue_list", true)
    .eq("songs.embeddable", true);

  // Otomatik çalma daima rotasyondan geçer (0032): aktif listeler sort_order
  // sırasıyla tüketilir. Seçici null dönerse (hiç aktif liste yok) ya da hiçbir
  // şey bulamazsa aşağıdaki katalog yedeğine düşülür — müzik susmaz.
  const catalogEligible = new Set((venueSongs ?? []).map((vs) => vs.song_id));
  const rotationPicks = await pickFromRotation(venueId, needed, {
    catalogEligible,
    excludeIds,
    cooldownIds,
  });

  if (rotationPicks && rotationPicks.length > 0) {
    await insertAutoRows(venueId, rotationPicks);
    return;
  }

  const activePool = await getActivePlaylistSongIds(venueId);

  const eligible = (venueSongs ?? []).map((vs) => vs.song_id).filter((id) => !excludeIds.has(id));
  const fromActive = activePool === null ? eligible : eligible.filter((id) => activePool.has(id));

  // Aktif listeler boşsa (ör. tüm şarkıları gizlenmiş) müzik susmasın diye
  // tüm kataloga düşülür — cooldown fallback'iyle aynı mantık
  const available = fromActive.length > 0 ? fromActive : eligible;

  // Cooldown'daki şarkılar elenir; ama liste küçük olup hepsi elenirse müzik
  // susmasın diye cooldown yok sayılır (kuyruğa/sahneye çıkma engeli hep geçerli)
  const fresh = available.filter((id) => !cooldownIds.has(id));
  const candidates = fresh.length > 0 ? fresh : available;

  if (candidates.length === 0) return;

  // Fisher-Yates shuffle, then pick `needed`
  shuffleInPlace(candidates);
  const picks = candidates.slice(0, needed);

  await insertAutoRows(venueId, picks.map((songId) => ({ songId, playlistId: null })));
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
