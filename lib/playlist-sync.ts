import { supabaseAdmin } from "@/lib/supabase/admin";
import { diffSource, nextSnapshot } from "@/lib/playlist-sync-diff";
import {
  attachSongsToPlaylist,
  detachVideosFromPlaylist,
  type AttachableSong,
} from "@/lib/playlist";
import {
  getPlaylistItemCounts,
  getPlaylistVideoIds,
  getVideoDetails,
  YouTubeQuotaError,
} from "@/lib/youtube";

// YouTube playlist'lerinin günlük senkronu (bkz. 0029 migration).
//
// Kota bütçesi, ucuzdan pahalıya sıralı dört kademe:
//   1. playlists.list — 50 kaynak / 1 birim. Şarkı sayısı değişmediyse liste
//      hiç açılmaz. Hiçbir şey değişmediği günlerde toplam maliyet budur.
//   2. playlistItems.list — yalnızca sayısı değişen listeler, 50 şarkı / 1 birim.
//   3. Fark alma — snapshot ile karşılaştırma, tamamen yerel, 0 birim.
//   4. videos.list — yalnızca songs tablosunda HİÇ olmayan videolar, 50 / 1 birim.
//
// Aynı YouTube listesini birden çok mekan kullanıyorsa liste bir kez okunur,
// sonuç tüm mekanlara dağıtılır — maliyet mekan sayısıyla çarpılmaz.
//
// Senkron tüm mekanlarda daima açıktır; auto_sync yalnızca ölü kaynağı
// dondurmak için kullanılır (bkz. markFailed).

const UNIT_BUDGET = 1000;
const MAX_SOURCES_PER_RUN = 500;
const SONG_LOOKUP_CHUNK = 200;

type SourceRow = {
  playlist_id: string;
  venue_id: string;
  youtube_playlist_id: string;
  snapshot_video_ids: string[];
  last_item_count: number | null;
  unchanged_streak: number;
  fail_count: number;
};

export type GoneSong = { playlist_id: string; video_id: string; title: string; artist: string };

export type SyncReport = {
  checked: number;
  fetched: number;
  added: number;
  removed: number;
  failed: number;
  units: number;
  // YouTube kaynağından çıkarılmış ama PMJ listesinde DURAN şarkılar. Hiçbiri
  // otomatik silinmez: panel mekana gösterir, mekan isterse kaldırır.
  gone: GoneSong[];
  budget_exhausted: boolean;
  quota_exceeded: boolean;
};

// Uyuyan listeler seyrekleşir: 1 → 2 → 4 → 7 gün. Değişiklik bulunan liste
// ertesi gün yeniden yoklanır (streak sıfırlanır).
function nextCheckAt(unchangedStreak: number): string {
  const days = Math.min(2 ** unchangedStreak, 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// Liste silinmiş/gizlenmişse veya API hata verdiyse geri çekil — ama vazgeçme,
// mekan yayını geri açabilir. 10 başarısızlıktan sonra auto_sync kapanır: bu
// artık bir kullanıcı ayarı değil, ölü kaynak freni (panelde açma/kapama yok).
// Kaynak düzelirse "şimdi güncelle" ilk başarılı turda auto_sync'i geri açar.
function backoffAt(failCount: number): string {
  const days = Math.min(2 ** Math.max(failCount - 1, 0), 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function markFailed(source: SourceRow, message: string): Promise<void> {
  const failCount = source.fail_count + 1;
  await supabaseAdmin
    .from("playlist_sources")
    .update({
      fail_count: failCount,
      last_error: message.slice(0, 300),
      next_check_at: backoffAt(failCount),
      auto_sync: failCount < 10,
    })
    .eq("playlist_id", source.playlist_id);
}

// Yeni video kimliklerini şarkıya çevirir. songs'ta zaten olanlar için videos.list
// atılmaz — platform büyüdükçe yeni şarkıların çoğu başka bir mekan sayesinde
// zaten tanınıyor olur. Embed'e kapalı şarkılar elenir (gömülü player'da çalmaz).
async function resolveSongs(
  videoIds: string[]
): Promise<{ songs: Map<string, AttachableSong>; units: number }> {
  const songs = new Map<string, AttachableSong>();
  if (videoIds.length === 0) return { songs, units: 0 };

  const unknown: string[] = [];
  for (let i = 0; i < videoIds.length; i += SONG_LOOKUP_CHUNK) {
    const chunk = videoIds.slice(i, i + SONG_LOOKUP_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select("id, youtube_video_id, title, artist, channel_title, view_count, duration_ms, embeddable")
      .in("youtube_video_id", chunk);
    if (error) throw new Error(error.message);

    const found = new Set<string>();
    for (const row of data ?? []) {
      found.add(row.youtube_video_id);
      // embeddable=false: metadata cron'u videoyu silinmiş/gizlenmiş bulmuş.
      // Listeye eklemeyiz ama snapshot'ta kalır, yarın tekrar denenmez.
      if (row.embeddable === false) continue;
      songs.set(row.youtube_video_id, {
        id: row.id,
        title: row.title,
        artist: row.artist,
        channel_title: row.channel_title,
        view_count: row.view_count,
        duration_ms: row.duration_ms,
      });
    }
    for (const id of chunk) if (!found.has(id)) unknown.push(id);
  }

  if (unknown.length === 0) return { songs, units: 0 };

  const details = await getVideoDetails(unknown);
  const units = Math.ceil(unknown.length / 50);
  if (details.length === 0) return { songs, units };

  const { data: inserted, error } = await supabaseAdmin
    .from("songs")
    .upsert(
      details.map((t) => ({
        youtube_video_id: t.youtube_video_id,
        title: t.title,
        artist: t.artist,
        album_cover_url: t.album_cover_url,
        duration_ms: t.duration_ms,
        channel_title: t.channel_title,
        view_count: t.view_count,
      })),
      { onConflict: "youtube_video_id" }
    )
    .select("id, youtube_video_id, title, artist, channel_title, view_count, duration_ms");
  if (error) throw new Error(error.message);

  for (const row of inserted ?? []) {
    songs.set(row.youtube_video_id, {
      id: row.id,
      title: row.title,
      artist: row.artist,
      channel_title: row.channel_title,
      view_count: row.view_count,
      duration_ms: row.duration_ms,
    });
  }
  return { songs, units };
}

// Kaynaktan çıkarılmış videolardan PMJ listesinde hâlâ duranlar (başlıklarıyla)
async function goneStillInPlaylist(playlistId: string, videoIds: string[]): Promise<GoneSong[]> {
  const out: GoneSong[] = [];
  for (let i = 0; i < videoIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("playlist_songs")
      .select("songs!inner(youtube_video_id, title, artist)")
      .eq("playlist_id", playlistId)
      .in("songs.youtube_video_id", videoIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const rel = row.songs as unknown as
        | { youtube_video_id: string; title: string; artist: string }
        | { youtube_video_id: string; title: string; artist: string }[];
      const song = Array.isArray(rel) ? rel[0] : rel;
      if (song) out.push({ playlist_id: playlistId, video_id: song.youtube_video_id, title: song.title, artist: song.artist });
    }
  }
  return out;
}

/**
 * Mekanın ONAYIYLA çağrılır: panelde "YouTube listesinden çıkarılmış" diye
 * gösterilen şarkılardan seçilenleri PMJ listesinden kaldırır. Yalnızca bu
 * kaynaktan gelmiş (snapshot'ta olan) ve YouTube'da artık OLMAYAN videolar
 * kaldırılabilir — istemciden gelen kimlik listesine körü körüne güvenilmez.
 */
export async function removeGoneSongs(playlistId: string, videoIds: string[]): Promise<number> {
  const { data: source, error } = await supabaseAdmin
    .from("playlist_sources")
    .select("venue_id, youtube_playlist_id, snapshot_video_ids")
    .eq("playlist_id", playlistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source) return 0;

  const { videoIds: current, complete } = await getPlaylistVideoIds(source.youtube_playlist_id);
  if (!complete) throw new Error("YouTube listesi sonuna kadar okunamadı — kaldırma yapılmadı");
  const live = new Set(current);
  const known = new Set(source.snapshot_video_ids as string[]);
  const removable = videoIds.filter((id) => known.has(id) && !live.has(id));
  if (removable.length === 0) return 0;
  return detachVideosFromPlaylist(source.venue_id as string, playlistId, removable);
}

/**
 * Otomatik senkronu açık, sırası gelmiş playlist'leri günceller.
 *
 * @param force        Şarkı sayısı kontrolünü atlayıp tüm listeleri baştan okur.
 *                     Haftalık tam tarama için: itemCount'un tek kör noktası aynı
 *                     gün 1 ekleyip 1 silmektir (sayı sabit kalır), bu tur onu kapatır.
 * @param playlistIds  Yalnızca bu playlist'ler. Panelden "şimdi güncelle" için;
 *                     verildiğinde sıra (next_check_at) ve auto_sync gözetilmez.
 * @param collectGone  Kaynak listeden çıkarılmış ama PMJ listesinde duran
 *                     şarkıları rapora (gone) yazar. SİLMEZ (17 Eki 2026 kararı:
 *                     "Şimdi güncelle" eskiden onları siliyordu; 500'ü aşan listede
 *                     500'ün ötesi de "çıkarılmış" sanılıp gidiyordu). Panel listeyi
 *                     mekana gösterir, mekan onaylarsa removeGoneSongs ile kalkar.
 */
export async function syncPlaylistSources(
  {
    force = false,
    budget = UNIT_BUDGET,
    playlistIds,
    collectGone = false,
  }: { force?: boolean; budget?: number; playlistIds?: string[]; collectGone?: boolean } = {}
): Promise<SyncReport> {
  const report: SyncReport = {
    checked: 0,
    fetched: 0,
    added: 0,
    removed: 0,
    failed: 0,
    units: 0,
    gone: [],
    budget_exhausted: false,
    quota_exceeded: false,
  };

  let query = supabaseAdmin
    .from("playlist_sources")
    .select("playlist_id, venue_id, youtube_playlist_id, snapshot_video_ids, last_item_count, unchanged_streak, fail_count");

  if (playlistIds) {
    // Elle tetikleme: mekan butona bastıysa sıra beklemez
    query = query.in("playlist_id", playlistIds);
  } else {
    query = query.eq("auto_sync", true);
    if (!force) query = query.lte("next_check_at", new Date().toISOString());
  }

  const { data, error } = await query
    .order("next_check_at", { ascending: true })
    .limit(MAX_SOURCES_PER_RUN);

  if (error) throw new Error(error.message);
  const sources = (data ?? []) as SourceRow[];
  if (sources.length === 0) return report;
  report.checked = sources.length;

  // Kaynak bazında grupla: aynı YouTube listesi kaç mekanda olursa olsun bir kez okunur
  const groups = new Map<string, SourceRow[]>();
  for (const s of sources) {
    const list = groups.get(s.youtube_playlist_id);
    if (list) list.push(s);
    else groups.set(s.youtube_playlist_id, [s]);
  }

  // Kademe 1 — şarkı sayıları. force turunda da çekilir: sayı kaydedilmezse
  // ertesi günkü ucuz kontrol çalışamaz.
  let counts: Map<string, number>;
  try {
    const result = await getPlaylistItemCounts([...groups.keys()]);
    counts = result.counts;
    report.units += result.units;
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      report.quota_exceeded = true;
      return report;
    }
    throw err;
  }

  for (const [youtubePlaylistId, rows] of groups) {
    if (report.units >= budget) {
      // Bütçe doldu — dokunulmayan kaynakların next_check_at'i geçmişte kalır,
      // yarınki tur en eskiden başlayarak kaldığı yerden devam eder
      report.budget_exhausted = true;
      break;
    }

    const itemCount = counts.get(youtubePlaylistId);

    if (itemCount === undefined) {
      // playlists.list yanıtında yok: liste silinmiş veya gizliye alınmış
      for (const row of rows) {
        await markFailed(row, "YouTube listesi bulunamadı — silinmiş veya gizli olabilir");
        report.failed++;
      }
      continue;
    }

    // Kademe 1'in getirisi: sayı değişmemişse liste hiç açılmaz
    if (!force && rows.every((r) => r.last_item_count === itemCount)) {
      for (const row of rows) {
        await supabaseAdmin
          .from("playlist_sources")
          .update({
            unchanged_streak: row.unchanged_streak + 1,
            next_check_at: nextCheckAt(row.unchanged_streak + 1),
            fail_count: 0,
            last_error: null,
            auto_sync: true,
          })
          .eq("playlist_id", row.playlist_id);
      }
      continue;
    }

    try {
      // Kademe 2 — listeyi sayfa sayfa oku
      const { videoIds, units, complete } = await getPlaylistVideoIds(youtubePlaylistId);
      report.units += units;
      report.fetched++;

      // Kademe 3 — fark, tamamen yerel (lib/playlist-sync-diff.ts). Okuma
      // EKSİKSE (tavanda kesildi ya da şarkı sayısı varken boş döndü) "listede
      // yok" kararı verilmez. Ölçüt "bir zamanlar bu kaynaktan geldi ama artık
      // listede yok" olduğu için mekanın elle eklediği şarkılar hiçbir zaman
      // çıkarılmış sayılmaz.
      const perRow = rows.map((row) => ({
        row,
        ...diffSource({ snapshot: row.snapshot_video_ids, videoIds, complete, itemCount }),
      }));

      // Kademe 4 — detay yalnızca hiç tanımadığımız videolar için
      const union = [...new Set(perRow.flatMap((p) => p.newIds))];
      const { songs, units: detailUnits } = await resolveSongs(union);
      report.units += detailUnits;

      for (const { row, newIds, goneIds, reliable } of perRow) {
        const toAttach = newIds
          .map((id) => songs.get(id))
          .filter((s): s is AttachableSong => !!s);

        let added = 0;
        if (toAttach.length > 0) {
          const result = await attachSongsToPlaylist(row.venue_id, row.playlist_id, toAttach);
          added = result.added;
          report.added += added;
        }

        // Çıkarılmış ama PMJ listesinde DURAN şarkılar: silinmez, snapshot'ta
        // tutulur (her elle güncellemede yeniden gösterilsin, ama "yeni" sanılıp
        // tekrar da eklenmesin). Mekan kaldırınca bir sonraki turda düşer.
        const stillMembers = goneIds.length > 0 ? await goneStillInPlaylist(row.playlist_id, goneIds) : [];
        if (collectGone) report.gone.push(...stillMembers);

        // snapshot tam listeyle güncellenir — embed'e kapalı ve eklenemeyen
        // videolar dahil, yoksa her gün yeniden denenirler. Okuma eksikse eski
        // snapshot'tan hiçbir şey düşmez.
        const snapshot = nextSnapshot({
          snapshot: row.snapshot_video_ids,
          videoIds,
          reliable,
          stillMemberGoneIds: stillMembers.map((g) => g.video_id),
        });
        const streak = added > 0 ? 0 : row.unchanged_streak + 1;
        await supabaseAdmin
          .from("playlist_sources")
          .update({
            snapshot_video_ids: snapshot,
            last_item_count: itemCount,
            last_synced_at: new Date().toISOString(),
            last_added: added,
            unchanged_streak: streak,
            next_check_at: nextCheckAt(streak),
            fail_count: 0,
            last_error: null,
            auto_sync: true,
          })
          .eq("playlist_id", row.playlist_id);
      }
    } catch (err) {
      if (err instanceof YouTubeQuotaError) {
        // Kota duvarı — kalan kaynaklar dokunulmadan yarına devreder
        report.quota_exceeded = true;
        break;
      }
      const message = err instanceof Error ? err.message : "senkron başarısız";
      for (const row of rows) {
        await markFailed(row, message);
        report.failed++;
      }
    }
  }

  return report;
}
