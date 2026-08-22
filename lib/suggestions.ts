import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { pickBestMatch, suggestionMatchesSong } from "@/lib/song-match";

// Serbest metin öneriler (song_id boş song_requests satırları) ile mekan
// playlist'ine yeni giren şarkıları eşleştirir. Mekan, önerilen şarkıyı kendi
// YouTube playlist'ine ekleyip panelden yeniden içe aktardığında öneri
// kendiliğinden kapanır — admin'in aynı işi ikinci kez yapması gerekmez.

export type MatchableSong = {
  id: string;
  title: string;
  artist: string;
  channel_title?: string | null;
  /** Sürüm seçiminde kullanılır (bkz. lib/song-match.ts) — yoksa eşleşme yine çalışır */
  view_count?: number | null;
  duration_ms?: number | null;
};

export type PendingSuggestion = {
  id: string;
  user_id: string | null;
  suggested_title: string | null;
  suggested_artist: string | null;
};

// Eşleşme ve sürüm seçimi lib/song-match.ts'te — aynı kurallar talep onayında
// (lib/request-approval.ts) ve tohumlamada da geçerli.
export { suggestionMatchesSong };

/**
 * Mekana yeni eklenen şarkılarla bekleyen önerileri eşleştirir; eşleşenleri
 * gerçek şarkıya bağlayıp 'accepted' yapar ve öneriyi yapan müşteriye push atar.
 * Kritik yol değil — hata durumunda sessizce geçer (playlist ekleme başarısız sayılmaz).
 */
export async function resolveMatchingSuggestions(
  venueId: string,
  songs: MatchableSong[]
): Promise<number> {
  if (songs.length === 0) return 0;

  const { data: pending } = await supabaseAdmin
    .from("song_requests")
    .select("id, user_id, suggested_title, suggested_artist")
    .eq("venue_id", venueId)
    .eq("status", "pending")
    .is("song_id", null);

  if (!pending || pending.length === 0) return 0;

  const now = new Date().toISOString();
  const matched: { suggestion: PendingSuggestion; song: MatchableSong }[] = [];

  for (const suggestion of pending as PendingSuggestion[]) {
    // İlk eşleşen değil EN İYİ sürüm: aynı listede şarkının canlı/karaoke
    // kaydı da bulunabiliyor (bkz. lib/song-match.ts SEÇME kuralları)
    const song = pickBestMatch(suggestion, songs);
    if (song) matched.push({ suggestion, song });
  }

  if (matched.length === 0) return 0;

  await Promise.all(
    matched.map(({ suggestion, song }) =>
      supabaseAdmin
        .from("song_requests")
        .update({ song_id: song.id, status: "accepted", resolved_at: now })
        .eq("id", suggestion.id)
        .eq("status", "pending")
    )
  );

  // Bildirim ateşle-unut: mekan slug'ı bildirim bağlantısı için gerekli
  (async () => {
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select("slug")
      .eq("id", venueId)
      .single();
    await Promise.all(
      matched
        .filter(({ suggestion }) => suggestion.user_id)
        .map(({ suggestion, song }) =>
          sendPushToUser(suggestion.user_id!, {
            title: "Önerin listeye eklendi! 🎉",
            body: `${song.title} — ${song.artist} artık sıraya eklenebilir`,
            url: venue?.slug ? `/venue/${venue.slug}/browse` : "/",
          })
        )
    );
  })().catch(() => {});

  return matched.length;
}
