// Sunucuya ulaşılamazken player'ın çalacağı sıradaki şarkı — saf (importsuz),
// testi lib/offline-backup.test.ts.
//
// Yedek = sunucunun son "sıradakiler" cevabı (en fazla 5). Sırayı her zaman
// sunucu belirler; bu seçim yalnızca kesintide kullanılır. Kesintide çalınıp
// biten şarkılar bağlantı dönünce sunucuya "çalındı" diye bildirilir.

export function pickOfflineVideo(input: {
  // Tamponda hazır duran (ilk tercih)
  preloaded: string | null;
  // Sunucudan alınmış sıradakiler, sırasıyla
  backup: readonly string[];
  // Şu an çalan
  current: string | null;
  // Kesintiden önceki son şarkı (sunucunun sahnesinde hâlâ o var)
  fallbackFrom: string | null;
  // Kesintide yedekten çalınıp bitmiş olanlar
  played: readonly string[];
  // Bu oturumda çalınamadığı görülenler
  unplayable: ReadonlySet<string>;
}): string | null {
  const used = new Set(input.played);
  if (input.fallbackFrom) used.add(input.fallbackFrom);
  const usable = (id: string | null): id is string =>
    !!id && id !== input.current && !used.has(id) && !input.unplayable.has(id);
  if (usable(input.preloaded)) return input.preloaded;
  return input.backup.find((id) => usable(id)) ?? null;
}
