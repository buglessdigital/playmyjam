// Giriş ekranına gitmeden önce yazılan talebi saklar; müşteri hesabına girip
// gözat sayfasına döndüğünde talep kendiliğinden gönderilir (bkz. BrowseClient).
//
// Neden sessionStorage: talep yalnızca o oturumdaki "şimdi gönderiyordum"
// niyetine ait. Sekme kapanırsa niyet de biter; ayrıca cihazı başkasına veren
// müşterinin talebi sonraki kişinin hesabından gitmez.

const TTL_MS = 30 * 60 * 1000;

export type PendingSuggestion = { title: string; artist: string; savedAt: number };

function key(venueId: string) {
  return `pmj_pending_suggestion_${venueId}`;
}

export function savePendingSuggestion(venueId: string, title: string, artist: string): void {
  try {
    sessionStorage.setItem(
      key(venueId),
      JSON.stringify({ title, artist, savedAt: Date.now() } satisfies PendingSuggestion)
    );
  } catch {
    // storage kapalı/dolu — talep kaybolur, kullanıcı tekrar yazar
  }
}

/** Saklanan talebi okur ve SİLER: aynı talep iki kez gönderilmesin. */
export function takePendingSuggestion(venueId: string): PendingSuggestion | null {
  try {
    const raw = sessionStorage.getItem(key(venueId));
    if (!raw) return null;
    sessionStorage.removeItem(key(venueId));

    const parsed = JSON.parse(raw) as Partial<PendingSuggestion>;
    if (typeof parsed?.title !== "string" || typeof parsed?.artist !== "string") return null;
    // Bayat niyet: yarım saat önce vazgeçilmiş bir talep şimdi gönderilmemeli
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > TTL_MS) return null;

    return { title: parsed.title, artist: parsed.artist, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearPendingSuggestion(venueId: string): void {
  try {
    sessionStorage.removeItem(key(venueId));
  } catch {
    // yok say
  }
}
