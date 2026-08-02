import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { fold } from "@/lib/similar";

// Serbest metin öneriler (song_id boş song_requests satırları) ile mekan
// playlist'ine yeni giren şarkıları eşleştirir. Mekan, önerilen şarkıyı kendi
// YouTube playlist'ine ekleyip panelden yeniden içe aktardığında öneri
// kendiliğinden kapanır — admin'in aynı işi ikinci kez yapması gerekmez.

// YouTube başlıklarında sürekli geçen, eşleşmeye katkısı olmayan kelimeler
const NOISE = new Set([
  "official", "video", "audio", "lyrics", "lyric", "visualizer", "klip", "sozleri", "sozler",
  "feat", "ft", "prod", "remix", "mix", "version", "versiyon", "live", "canli", "cover",
  "music", "full", "album", "original", "radio", "edit", "extended", "remastered",
  "hd", "hq", "4k", "the", "and", "ile",
]);

function tokens(text: string): string[] {
  return fold(text)
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

export type MatchableSong = {
  id: string;
  title: string;
  artist: string;
  channel_title?: string | null;
};

export type PendingSuggestion = {
  id: string;
  user_id: string | null;
  suggested_title: string | null;
  suggested_artist: string | null;
};

// Eşleşme ölçütü: önerinin hem şarkı adı hem sanatçı kelimelerinin tamamı
// şarkının başlık/sanatçı/kanal metninde geçmeli. YouTube başlıkları
// "TARKAN - Kuzu Kuzu (Official Video)" gibi olduğu için kelime kümesi
// karşılaştırması sıralamadan bağımsız çalışır.
export function suggestionMatchesSong(
  suggestion: { suggested_title: string | null; suggested_artist: string | null },
  song: MatchableSong
): boolean {
  const titleTokens = tokens(suggestion.suggested_title ?? "");
  const artistTokens = tokens(suggestion.suggested_artist ?? "");
  if (titleTokens.length === 0 || artistTokens.length === 0) return false;

  const haystack = new Set(
    tokens(`${song.title} ${song.artist} ${song.channel_title ?? ""}`)
  );
  return (
    titleTokens.every((t) => haystack.has(t)) && artistTokens.every((t) => haystack.has(t))
  );
}

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
    const song = songs.find((s) => suggestionMatchesSong(suggestion, s));
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
