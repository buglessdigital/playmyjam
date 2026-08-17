// Sahnedeki şarkının "ne kadar çaldı" hesabı ve erken ilerletme kapısı.
// Saf mantık: veri erişimi yok, birim testi buradan yapılır (lib/stage-clock.test.ts).

/**
 * ERKEN İLERLETME KAPISI.
 *
 * Otomatik ilerletme ("şarkı bitti") ancak şarkı GERÇEKTEN bitmeye yakınsa
 * kabul edilir. Sebebi mekan kayıtlarında görüldü: 17 Ağustos'ta Mezzanine'de
 * 16:08–16:14 arası 14 şarkı 1–64 saniyede sahneye çıkıp `played` oldu, yani
 * kuyruk hiç çalmadan eridi. Panelde bu, "sıradaki şarkı bir saniye açılıp
 * kayboldu, sıradakiler yok oldu" diye görünüyor.
 *
 * İstemcide bunun onlarca sebebi olabilir (aynı anda iki oynatıcı, düşen istek
 * sonrası tekrar, çapraz geçişin bayat tamponu, YouTube'un anında ENDED
 * vermesi). Hepsini tek tek kovalamak yerine kural SUNUCUDA duruyor: şarkının
 * daha bu kadar vakti varsa kuyruk ilerlemez.
 *
 * Pay, çapraz geçişin en uzun süresinden (12 sn) belirgin biçimde geniş: geçiş
 * kuyruğu şarkı bitmeden başlatıyor ve bu MEŞRU.
 */
const EARLY_ADVANCE_TOLERANCE_MS = 20_000;

export type StageClock = {
  now: number;
  durationMs: number | null;
  // Kuyruk satırının çapası: şarkı sahneye ÇIKTIĞI an. Sarmayla değişmez —
  // 30 dk'lık tekrar kilidinin çapası da bu (0025), oynatmaya göre kaydırılamaz.
  queueStartedAt: string | null;
  stageSongId: string | null;
  // Oynatıcının 15 sn'de bir yazdığı GERÇEK konum: sarma burada görünür
  // (heartbeat started_at'i now - progress ile yeniden çapalar).
  np: {
    songId: string | null;
    startedAt: string | null;
    progressMs: number | null;
    isPlaying: boolean;
  } | null;
};

/**
 * Sahnedeki şarkının ne kadar çaldığı. İki çapanın BÜYÜĞÜ alınır:
 *
 *  - kuyruk satırı (sahneye çıkış anı): her zaman var, ama sarmayı görmez.
 *  - now_playing (oynatıcının raporladığı konum): ileri sarmayı görür.
 *
 * Büyüğünü almak kasıtlı: ileri sarma "şarkı bitti"yi meşru kılar, geri sarma
 * ise kapıyı yalnızca GEVŞETİR. Sessizlik riski doğuran yön hep açık kalır.
 */
export function stageElapsedMs(clock: StageClock): number | null {
  const candidates: number[] = [];
  const add = (value: number | null) => {
    if (value !== null && Number.isFinite(value) && value >= 0) candidates.push(value);
  };

  if (clock.queueStartedAt) {
    const started = Date.parse(clock.queueStartedAt);
    add(Number.isNaN(started) ? null : clock.now - started);
  }

  // now_playing yalnızca AYNI şarkıyı gösteriyorsa güvenilir: şarkı az önce
  // değiştiyse oradaki konum bir öncekine aittir.
  const np = clock.np;
  if (np && np.songId && clock.stageSongId && np.songId === clock.stageSongId) {
    if (np.isPlaying && np.startedAt) {
      const anchor = Date.parse(np.startedAt);
      add(Number.isNaN(anchor) ? null : clock.now - anchor);
    } else {
      add(np.progressMs ?? null);
    }
  }

  return candidates.length ? Math.max(...candidates) : null;
}

// Sahnedeki şarkının daha çalacak vakti var mı? true ise kuyruk İLERLEMEZ.
// Süre bilinmiyorsa ya da hiçbir çapa okunamıyorsa kapı AÇILIR (fail-open):
// yanlışlıkla sonsuza kadar takılı kalmaktansa eski davranış sürsün.
export function shouldKeepStage(clock: StageClock): boolean {
  const duration = clock.durationMs ?? 0;
  if (duration <= 0) return false;
  const elapsed = stageElapsedMs(clock);
  if (elapsed === null) return false;
  return duration - elapsed > EARLY_ADVANCE_TOLERANCE_MS;
}
