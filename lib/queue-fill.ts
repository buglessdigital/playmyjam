import { supabaseAdmin } from "@/lib/supabase/admin";

const QUEUE_TARGET = 10;
const AUTO_POSITION_BASE = 9000;
const COOLDOWN_MS = 30 * 60 * 1000;

export async function fillQueueToTen(venueId: string): Promise<void> {
  // Current queued count (playing is separate status, not counted)
  const { count: totalQueued } = await supabaseAdmin
    .from("queue")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .eq("status", "queued");

  const current = totalQueued ?? 0;

  // If over target, trim excess auto-fill songs (customer songs are never removed here)
  if (current > QUEUE_TARGET) {
    const excess = current - QUEUE_TARGET;
    const { data: autoFills } = await supabaseAdmin
      .from("queue")
      .select("id")
      .eq("venue_id", venueId)
      .eq("status", "queued")
      .is("user_id", null)
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

  // Venue playlist candidates.
  // Çalınamaz işaretlenen (embed kapalı) videolar otomatik doldurmaya girmez.
  const { data: venueSongs } = await supabaseAdmin
    .from("venue_songs")
    .select("song_id, songs!inner(embeddable)")
    .eq("venue_id", venueId)
    .eq("in_venue_list", true)
    .eq("songs.embeddable", true);

  const available = (venueSongs ?? []).map((vs) => vs.song_id).filter((id) => !excludeIds.has(id));

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
      added_by: "auto",
      tokens_spent: 0,
      priority: false,
      position: startPos + i,
      status: "queued",
    }))
  );
}
