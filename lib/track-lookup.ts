import { cacheLife } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchOEmbed } from "@/lib/youtube-oembed";
import { videoThumbnail } from "@/lib/youtube-parse";
import type { TrackDetails } from "@/lib/youtube";

// Şarkı detay kabuğunun veri kaynağı. Eskiden burada videos.list vardı
// (getTrackDetails) — sayfa görüntülemesi başına kota yakıyordu.
//
// Yeni sıra, ikisi de 0 birim:
//   1. songs tablosu — şarkı zaten kataloğa girmişse tüm alanlar burada,
//      üstelik SÜRE de var (oEmbed süre vermiyor).
//   2. oEmbed — havuzda hiç görülmemiş bir kimlik için kotasız yedek.
//      Süre 0 kalır; sayfa süreyi göstermez, çalma etkilenmez.
export async function getTrackForDetail(videoId: string): Promise<TrackDetails | null> {
  "use cache";
  cacheLife("days");

  const { data } = await supabaseAdmin
    .from("songs")
    .select("youtube_video_id, title, artist, album_cover_url, duration_ms, channel_title, view_count, embeddable")
    .eq("youtube_video_id", videoId)
    .maybeSingle();

  if (data) {
    // embeddable=false: video silinmiş ya da gömmeye kapatılmış — sayfa "çalınamaz"
    // durumunu zaten kendi gösteriyor, burada satırı yok saymak yanlış olur
    return {
      youtube_video_id: data.youtube_video_id,
      title: data.title,
      artist: data.artist,
      album_cover_url: data.album_cover_url ?? videoThumbnail(videoId),
      duration_ms: data.duration_ms ?? 0,
      channel_title: data.channel_title ?? "",
      view_count: data.view_count ?? 0,
      release_date: null,
      external_url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  const oembed = await fetchOEmbed(videoId);
  if (!oembed) return null;

  return {
    ...oembed,
    duration_ms: 0,
    view_count: 0,
    release_date: null,
    external_url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
