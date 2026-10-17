// YouTube kaynağı ile PMJ listesinin farkı — saf (importsuz), testi
// lib/playlist-sync-diff.test.ts.
//
// Kural (17 Eki 2026): senkron HİÇBİR şeyi silmez. "Kaynaktan çıkarılmış" listesi
// yalnızca okuma EKSİKSİZSE çıkarılır ve mekana sorulmak üzere raporlanır.
// Eskiden "Şimdi güncelle" 500'de kesilen okumayı tam liste sanıyor, 500'ün
// ötesindeki bütün şarkıları siliyordu.

export type SourceDiff = {
  // Okuma eksiksiz mi? Değilse "listede yok" kararı verilemez
  reliable: boolean;
  // Snapshot'ta olmayan, yeni eklenecek videolar
  newIds: string[];
  // Snapshot'ta olup YouTube'da artık olmayanlar (yalnız reliable iken)
  goneIds: string[];
};

export function diffSource(input: {
  snapshot: readonly string[];
  videoIds: readonly string[];
  complete: boolean;
  itemCount: number;
}): SourceDiff {
  const reliable = input.complete && !(input.itemCount > 0 && input.videoIds.length === 0);
  const seen = new Set(input.snapshot);
  const current = new Set(input.videoIds);
  return {
    reliable,
    newIds: input.videoIds.filter((id) => !seen.has(id)),
    goneIds: reliable ? input.snapshot.filter((id) => !current.has(id)) : [],
  };
}

/**
 * Yeni snapshot. Okuma eksiksizse güncel liste + hâlâ PMJ listesinde duran
 * çıkarılmışlar (her elle güncellemede yeniden sorulsun, "yeni" sanılıp tekrar
 * da eklenmesin). Eksikse eski snapshot'tan HİÇBİR ŞEY düşmez.
 */
export function nextSnapshot(input: {
  snapshot: readonly string[];
  videoIds: readonly string[];
  reliable: boolean;
  stillMemberGoneIds: readonly string[];
}): string[] {
  if (!input.reliable) return [...new Set([...input.snapshot, ...input.videoIds])];
  return [...input.videoIds, ...input.stillMemberGoneIds];
}
