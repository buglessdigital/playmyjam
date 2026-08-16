// Jetonu yetmediği için jeton sayfasına giden müşterinin hangi şarkıyı eklemek
// istediğini saklar; gözat sayfasına döndüğünde o şarkının ekleme kartı
// kendiliğinden yeniden açılır (bkz. BrowseClient). Şarkı otomatik EKLENMEZ —
// jeton harcaması her zaman müşterinin son dokunuşuyla olur.
//
// Neden sessionStorage: niyet o oturuma ait (bkz. lib/pending-suggestion.ts).

const TTL_MS = 30 * 60 * 1000;

type PendingAdd = { videoId: string; savedAt: number };

function key(venueId: string) {
  return `pmj_pending_add_${venueId}`;
}

export function savePendingAdd(venueId: string, videoId: string): void {
  try {
    sessionStorage.setItem(key(venueId), JSON.stringify({ videoId, savedAt: Date.now() } satisfies PendingAdd));
  } catch {
    // storage kapalı — müşteri şarkıya tekrar dokunur
  }
}

/**
 * Saklanan şarkıyı silmeden okur. Şarkı detay sayfası bunu kullanır: kayıt başka
 * bir şarkıya aitse silinmemeli, müşteri gözat sayfasına döndüğünde orada açılsın.
 */
export function peekPendingAdd(venueId: string): string | null {
  try {
    const raw = sessionStorage.getItem(key(venueId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingAdd>;
    if (typeof parsed?.videoId !== "string") return null;
    // Bayat niyet: yarım saat önce vazgeçilen şarkı şimdi açılmasın
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > TTL_MS) return null;

    return parsed.videoId;
  } catch {
    return null;
  }
}

export function clearPendingAdd(venueId: string): void {
  try {
    sessionStorage.removeItem(key(venueId));
  } catch {
    // yok say
  }
}

/** Okur ve SİLER: ekleme kartı yalnızca bir kez kendiliğinden açılsın. */
export function takePendingAdd(venueId: string): string | null {
  const videoId = peekPendingAdd(venueId);
  clearPendingAdd(venueId);
  return videoId;
}
