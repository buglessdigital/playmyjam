import type { createClient } from "@/lib/supabase/client";

/**
 * Panel ile player arasındaki DÜŞÜK GECİKMELİ hat.
 *
 * Normal yol uzun: panel → /api/player → now_playing UPDATE → Postgres WAL →
 * Realtime → player. Her halka birkaç yüz ms ekliyor, toplamda düğmeye basıldıktan
 * ~1 sn sonra ses tepki veriyordu. Broadcast bunların hiçbirinden geçmez: mesaj
 * doğrudan Realtime sunucusu üzerinden karşı tarafa gider (~50-100 ms).
 *
 * Broadcast KALICI DEĞİLDİR ve garanti teslim etmez — bu yüzden HTTP/DB yolu
 * kaldırılmadı, ikisi PARALEL gider. Broadcast hızlı tepkiyi, DB yolu doğruluğu
 * ve kalıcılığı sağlar. Mesaj kaybolursa eski davranışa (1 sn) düşülür, yanlış
 * duruma değil.
 */

export type PlayerCommand =
  // Panelden anında uygulanacak komutlar
  | { type: "play" }
  | { type: "pause" }
  // next/previous sunucuda kuyruğu tüketir; panel yanıtı alır almaz hangi videonun
  // yükleneceğini buradan söyler, player DB turunu beklemez
  | { type: "load"; video_id: string }
  // Sunucu isteği yola çıktı: player kuyruk/ses tarafında hazırlanabilsin diye
  | { type: "seeking" }
  // Çalan şarkının içinde konum değiştir (panelin alt barındaki sarma çubuğu).
  // Kuyruğa dokunmaz; yalnızca aktif deck'in konumu değişir.
  | { type: "seek"; position_ms: number }
  | { type: "volume"; volume: number };

export type PlayerStateBeat = {
  video_id: string | null;
  is_playing: boolean;
  progress_ms: number;
  duration_ms: number | null;
  /** Gönderen cihazın saati — panel gecikmeyi telafi etmek için kullanır */
  at: number;
  /**
   * Ses FİİLEN akıyor mu (deck PLAYING). is_playing bunu söyleyemez: tamponlama
   * ve dış kaynaklı duraklatmalar boyunca bilerek true kalır, yoksa panelde
   * oynat/duraklat simgesi sürekli titrerdi.
   *
   * Panel ilerleme çubuğunu kendi saatiyle ilerletiyor; şarkı değişiminde
   * YouTube videoyu birkaç saniye tamponladığı için çubuk sesin önüne geçiyor,
   * sonra ilk gerçek ölçümde geri sıçrıyordu. Bu bayrak false iken panel saymaz:
   * çubuk sesin başlamasını bekler.
   *
   * Eski player sürümlerinde alan yoktur; panel yokluğunu "akıyor" sayar.
   */
  started?: boolean;
};

export const PLAYER_BUS_TOPIC = (venueDbId: string) => `player-bus:${venueDbId}`;
export const CMD_EVENT = "cmd";
export const STATE_EVENT = "state";

type Supabase = ReturnType<typeof createClient>;

/**
 * Ağ hattı — sekme başına TEK kanal, referans sayımlı.
 *
 * supabase.channel() aynı konu için var olan kanal NESNESİNİ geri verir. Panel
 * (usePlayback) ve player (YouTubePlayer) aynı sekmede ayrı ayrı kanal açıp
 * kapattığında aslında tek nesneyi paylaşıyorlardı: ana ekrandan başka sayfaya
 * geçilince panel kanalı kapatıyor, player'ın elindeki kanal da ölüyordu. Player
 * o andan sonra her saniyelik durum sinyalini REST'e düşürüyor (konsolda
 * "Realtime send() is automatically falling back to REST API"), TV modundaki
 * uzak oynatıcıya da panelden komut ulaşmıyordu.
 *
 * Burada kanal ilk katılanla açılır, son ayrılanla kapanır; her katılımcı
 * yalnızca kendi dinleyicisini ekler/çıkarır. Kendi yolladığımızı geri almayız
 * (self: false) — aynı sekme için aşağıdaki SAYFA İÇİ hat var.
 */
type SharedBus = {
  channel: ReturnType<Supabase["channel"]>;
  refs: number;
  cmd: Set<(cmd: PlayerCommand) => void>;
  state: Set<(beat: PlayerStateBeat) => void>;
};

const sharedBuses = new Map<string, SharedBus>();

export type PlayerBus = {
  sendCommand: (cmd: PlayerCommand) => void;
  sendState: (beat: PlayerStateBeat) => void;
  leave: () => void;
};

export function joinPlayerBus(
  supabase: Supabase,
  venueDbId: string,
  listen: { cmd?: (cmd: PlayerCommand) => void; state?: (beat: PlayerStateBeat) => void }
): PlayerBus {
  let bus = sharedBuses.get(venueDbId);
  if (!bus) {
    const cmd = new Set<(cmd: PlayerCommand) => void>();
    const state = new Set<(beat: PlayerStateBeat) => void>();
    const channel = supabase
      .channel(PLAYER_BUS_TOPIC(venueDbId), { config: { broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: CMD_EVENT }, ({ payload }: { payload: PlayerCommand }) => {
        for (const cb of [...cmd]) cb(payload);
      })
      .on("broadcast", { event: STATE_EVENT }, ({ payload }: { payload: PlayerStateBeat }) => {
        for (const cb of [...state]) cb(payload);
      })
      .subscribe();
    bus = { channel, refs: 0, cmd, state };
    sharedBuses.set(venueDbId, bus);
  }

  const joined = bus;
  joined.refs += 1;
  if (listen.cmd) joined.cmd.add(listen.cmd);
  if (listen.state) joined.state.add(listen.state);

  let left = false;
  const send = (event: string, payload: unknown) => {
    if (left) return;
    try {
      joined.channel.send({ type: "broadcast", event, payload });
    } catch {}
  };

  return {
    sendCommand: (cmd) => send(CMD_EVENT, cmd),
    sendState: (beat) => send(STATE_EVENT, beat),
    leave: () => {
      if (left) return;
      left = true;
      if (listen.cmd) joined.cmd.delete(listen.cmd);
      if (listen.state) joined.state.delete(listen.state);
      joined.refs -= 1;
      if (joined.refs === 0) {
        sharedBuses.delete(venueDbId);
        void supabase.removeChannel(joined.channel);
      }
    },
  };
}

/**
 * SAYFA İÇİ hat.
 *
 * Oynatıcı artık panelin içinde (bkz. components/admin/MiniPlayer.tsx), yani
 * gönderen ve alan çoğu zaman AYNI sekmede. Realtime yukarıdaki `self: false`
 * yüzünden bir istemcinin kendi mesajını ona geri vermez: aynı sekmedeyken ne
 * komut player'a ulaşıyordu ne de durum sinyali panele. Sarma (tek hattı
 * broadcast olan komut) bu yüzden hiç çalışmıyordu; alt bar da durum sinyali
 * alamadığı için ilerlemeyi veritabanının erken çapasından hesaplamak zorunda
 * kalıyor ve sesin önüne geçiyordu.
 *
 * Bu hat mesajı ağa hiç çıkarmadan doğrudan teslim eder. Realtime yolu duruyor:
 * TV modundaki uzak oynatıcı yalnızca oradan haber alır. Aynı sekmede çift
 * teslim olmaz, çünkü `self: false` uzak kopyayı zaten geri vermiyor.
 */
type LocalHandler<T> = (payload: T) => void;

const localCmd = new Map<string, Set<LocalHandler<PlayerCommand>>>();
const localState = new Map<string, Set<LocalHandler<PlayerStateBeat>>>();

function subscribeLocal<T>(map: Map<string, Set<LocalHandler<T>>>, key: string, cb: LocalHandler<T>) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) map.delete(key);
  };
}

function emitLocal<T>(map: Map<string, Set<LocalHandler<T>>>, key: string, payload: T) {
  const set = map.get(key);
  if (!set) return;
  // Kopya üstünde gezilir: bir dinleyici kendini çıkarırsa tur bozulmasın
  for (const cb of [...set]) {
    try {
      cb(payload);
    } catch {}
  }
}

export const sendLocalCommand = (venueDbId: string, cmd: PlayerCommand) =>
  emitLocal(localCmd, venueDbId, cmd);

export const onLocalCommand = (venueDbId: string, cb: LocalHandler<PlayerCommand>) =>
  subscribeLocal(localCmd, venueDbId, cb);

export const sendLocalState = (venueDbId: string, beat: PlayerStateBeat) =>
  emitLocal(localState, venueDbId, beat);

export const onLocalState = (venueDbId: string, cb: LocalHandler<PlayerStateBeat>) =>
  subscribeLocal(localState, venueDbId, cb);
