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

// Aktif playlist seçimi değişince çağrılır: kuyrukta bekleyen OTOMATİK şarkılar
// (added_by='auto') düşer ve yeni havuzdan yeniden doldurulur. Müşterinin jeton
// harcayarak eklediği şarkılara, adminin elle eklediklerine ve sahnede çalana
// dokunulmaz.
export async function resetAutoQueue(venueId: string): Promise<void> {
  await supabaseAdmin
    .from("queue")
    .update({ status: "removed" })
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .eq("added_by", AUTO_ADDED_BY);

  await fillQueueToTen(venueId);
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
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const picks = candidates.slice(0, needed);

  // Find the highest existing auto-fill position to avoid collisions
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
    picks.map((song_id, i) => ({
      venue_id: venueId,
      song_id,
      user_id: null,
      added_by: AUTO_ADDED_BY,
      tokens_spent: 0,
      priority: false,
      position: startPos + i,
      status: "queued",
    }))
  );
}
