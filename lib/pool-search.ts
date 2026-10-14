import { supabaseAdmin } from "@/lib/supabase/admin";
import { dedupeSongs, searchTokens, tokenPattern } from "@/lib/search-match";

// Ortak havuzda (songs) metin araması — panelin şarkı araması (/api/search) ve
// müşterinin "listede yok" sonuçları (/api/discover) aynı kuralı kullanır.
// HER kelime başlıkta ya da sanatçıda geçmeli; kelimeler Türkçe harf
// sınıflarıyla regex'e açılır (bkz. lib/search-match.ts). Hız trigram
// indeksine dayanıyor (0056).

export type PoolTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  duration_ms: number;
};

// Kelime başına bir regex koşulu: uzun yapıştırılmış metinler sorguyu şişirmesin
const MAX_TOKENS = 6;

/**
 * Havuzda arar, aynı şarkının kopyalarını teke indirir (en çok izlenen kalır).
 * Sorgu hatası (ör. statement timeout) null döner — "sonuç yok"tan ayırt
 * edilebilsin diye.
 */
export async function searchPool(q: string, limit: number): Promise<PoolTrack[] | null> {
  const tokens = searchTokens(q).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return [];

  let query = supabaseAdmin
    .from("songs")
    .select("youtube_video_id, title, artist, album_cover_url, duration_ms")
    .eq("embeddable", true);
  for (const token of tokens) {
    const pattern = tokenPattern(token);
    query = query.or(`title.imatch.${pattern},artist.imatch.${pattern}`);
  }
  // Kopyalar ayıklanacağı için fazladan çekilir: aynı şarkının klip/ses/sözler
  // videoları tek sonuca iner
  const { data, error } = await query
    .order("view_count", { ascending: false })
    .limit(Math.max(limit * 3, 40));
  if (error) return null;

  return dedupeSongs((data ?? []) as PoolTrack[]).slice(0, limit);
}
