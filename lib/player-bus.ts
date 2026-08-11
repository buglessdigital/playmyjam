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
};

export const PLAYER_BUS_TOPIC = (venueDbId: string) => `player-bus:${venueDbId}`;
export const CMD_EVENT = "cmd";
export const STATE_EVENT = "state";

type Supabase = ReturnType<typeof createClient>;

/** Ortak kanal ayarı: kendi yolladığımız mesajı geri almayız. */
export function playerBusChannel(supabase: Supabase, venueDbId: string) {
  return supabase.channel(PLAYER_BUS_TOPIC(venueDbId), {
    config: { broadcast: { self: false, ack: false } },
  });
}
