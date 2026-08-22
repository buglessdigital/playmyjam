import { parseVideoId, parseVideoTitle, videoThumbnail } from "@/lib/youtube-parse";

// YouTube'un oEmbed ucu: ANAHTAR İSTEMEZ, KOTA YAKMAZ.
// Data API'nin videos.list çağrısının (1 birim) yerine geçtiği yer, sürenin
// gerekmediği tek video okumalarıdır — şarkı detay kabuğu gibi.
//
// Verdiği: başlık, kanal adı, kapak.
// Vermediği: SÜRE, izlenme, embed durumu.
//   • süre        → songs satırında zaten var; yoksa player çalarken öğrenir
//   • embed       → erişilemeyen/gömülemeyen videoda uç 4xx döner, aşağıda null
//   • izlenme     → yalnızca sürüm sıralamasında kullanılıyor, yokluğu tolere edilir
//
// Bu yüzden oEmbed "ucuz okuma", videos.list ise "tam okuma" olarak kalır:
// süre şart olan yerlerde (kuyruk süresi, çapraz geçiş) hâlâ Data API kullanılır
// ama artık yalnızca elle onaylanan tek şarkılar için — talep başına 1 birim.

const OEMBED = "https://www.youtube.com/oembed";
const TIMEOUT_MS = 4000;

export type OEmbedTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
  channel_title: string;
};

// Bağlantı ayrıştırma saf dosyada (lib/youtube-parse.ts) — testten koşulabilsin
export { parseVideoId };

/**
 * Tek videonun kotasız özeti. Video silinmiş, gizli veya gömmeye kapalıysa
 * uç 4xx döner — o durumda null, çağıran taraf "çalınamaz" muamelesi yapar.
 */
export async function fetchOEmbed(videoId: string): Promise<OEmbedTrack | null> {
  const url = `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Video metadata'sı sık değişmiyor; CDN katmanında bir gün tutulabilir
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    if (!json.title) return null;

    const channelTitle = json.author_name ?? "";
    // Başlık çözümlemesi Data API yolundakiyle AYNI (lib/youtube-parse.ts) —
    // aksi halde aynı video iki kaynaktan iki farklı sanatçı adıyla kaydedilir
    const { title, artist } = parseVideoTitle(json.title, channelTitle);

    return {
      youtube_video_id: videoId,
      title,
      artist,
      album_cover_url: json.thumbnail_url ?? videoThumbnail(videoId),
      channel_title: channelTitle,
    };
  } catch {
    return null; // zaman aşımı / ağ hatası — çağıran taraf kendi yedeğine düşer
  }
}
