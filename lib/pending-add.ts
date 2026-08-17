// Ekleme akışı sırasında araya bir adım girdiğinde (giriş ekranı ya da ödeme)
// müşterinin hangi şarkıyı çaldırmak istediğini saklar; geri döndüğünde şarkıyı
// baştan aramak zorunda kalmaz.
//
// İki ayrı niyet var:
//  - autoAdd: false — jeton yüklemeye/girişe gidildi, dönüşte ekleme kartı açılır,
//    son dokunuş yine müşterinindir.
//  - autoAdd: true  — jeton DOĞRUDAN bu şarkı için, seçilmiş öncelikle satın alındı
//    (bkz. components/browse/AddSongSheet). Ödeme onayı zaten o şarkı ve o fiyat
//    için verildiği için dönüşte ikinci kez sormak adım eklemekten başka bir işe
//    yaramaz: şarkı kendiliğinden sıraya girer.
//
// Neden sessionStorage: niyet o oturuma ait (bkz. lib/pending-suggestion.ts).

const TTL_MS = 30 * 60 * 1000;

export type PendingAdd = {
  videoId: string;
  /** Ödeme sonrası hangi sıraya ekleneceği */
  priority: boolean;
  /** Jeton bu şarkı için satın alındı mı — dönüşte kart açmak yerine doğrudan ekle */
  autoAdd: boolean;
};

type StoredPendingAdd = PendingAdd & { savedAt: number };

function key(venueId: string) {
  return `pmj_pending_add_${venueId}`;
}

export function savePendingAdd(
  venueId: string,
  videoId: string,
  intent: { priority?: boolean; autoAdd?: boolean } = {}
): void {
  try {
    const record: StoredPendingAdd = {
      videoId,
      priority: intent.priority ?? false,
      autoAdd: intent.autoAdd ?? false,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(key(venueId), JSON.stringify(record));
  } catch {
    // storage kapalı — müşteri şarkıya tekrar dokunur
  }
}

/**
 * Saklanan niyeti silmeden okur. Şarkı detay sayfası bunu kullanır: kayıt başka
 * bir şarkıya aitse silinmemeli, müşteri gözat sayfasına döndüğünde orada açılsın.
 */
export function peekPendingAdd(venueId: string): PendingAdd | null {
  try {
    const raw = sessionStorage.getItem(key(venueId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredPendingAdd>;
    if (typeof parsed?.videoId !== "string") return null;
    // Bayat niyet: yarım saat önce vazgeçilen şarkı şimdi açılmasın
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > TTL_MS) return null;

    return {
      videoId: parsed.videoId,
      priority: parsed.priority === true,
      autoAdd: parsed.autoAdd === true,
    };
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

/** Okur ve SİLER: niyet yalnızca bir kez işlensin. */
export function takePendingAdd(venueId: string): PendingAdd | null {
  const pending = peekPendingAdd(venueId);
  clearPendingAdd(venueId);
  return pending;
}
