import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import {
  getPlaylistInfo,
  getPlaylistVideoIds,
  getVideoDetails,
  parsePlaylistId,
  YouTubeQuotaError,
} from "@/lib/youtube";
import { assertVenuePlaylist, attachSongsToPlaylist, getDefaultPlaylistId } from "@/lib/playlist";

// Public YouTube playlist'indeki tüm şarkıları mekanın bir playlist'ine toplu ekler.
// OAuth gerekmez — admin playlist URL'sini yapıştırır.
// Hedef: body.playlist_id (mevcut liste) | body.new_playlist (yeni liste açılır) | varsayılan.
// body.auto_sync ile günlük otomatik güncelleme açılır (bkz. lib/playlist-sync.ts).
// { added, skipped, playlist } döner.
export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const playlistId = parsePlaylistId(typeof body?.playlist_url === "string" ? body.playlist_url : "");
  if (!playlistId) {
    return NextResponse.json({ error: "Geçersiz playlist bağlantısı" }, { status: 400 });
  }

  const targetId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  if (targetId && !(await assertVenuePlaylist(session.venue_id, targetId))) {
    return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
  }

  // Ham kimlikler (snapshot için) ile filtrelenmiş şarkılar ayrı: embed'e kapalı
  // videolar listeye girmez ama snapshot'ta durmalı, yoksa senkron her gün onları
  // yeniden dener. Şarkı sayısı da buradan gelir — playlists.list'in verdiği ham
  // sayı (silinmiş videolar dahil) senkronun ucuz ön kontrolünün dayanağıdır.
  let videoIds: string[] = [];
  let playlistTitle: string | null = null;
  let itemCount: number | null = null;
  let tracks;
  try {
    const [items, info] = await Promise.all([
      getPlaylistVideoIds(playlistId),
      getPlaylistInfo(playlistId),
    ]);
    videoIds = items.videoIds;
    playlistTitle = info.title;
    itemCount = info.itemCount;
    tracks = await getVideoDetails(videoIds);
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json(
      { error: "Playlist alınamadı — bağlantının herkese açık olduğundan emin olun" },
      { status: 400 }
    );
  }

  // Senkron her içe aktarımda açılır — mekanın kapatma seçeneği yok. Kotaya
  // etkisi ihmal edilebilir (bkz. lib/playlist-sync.ts kademeli bütçe),
  // buna karşılık liste hep YouTube'daki haliyle güncel kalır.
  const autoSync = true;

  const rows = tracks.map((t) => ({
    youtube_video_id: t.youtube_video_id,
    title: t.title,
    artist: t.artist,
    album_cover_url: t.album_cover_url,
    duration_ms: t.duration_ms,
    channel_title: t.channel_title,
    view_count: t.view_count,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0 });
  }

  // Hedef liste: verilen liste, "yeni liste" isteniyorsa YouTube başlığıyla açılan
  // liste (çalma sırasına girmeden başlar), hiçbiri yoksa mekanın varsayılan listesi
  let target = targetId;
  let createdPlaylist: { id: string; name: string; queue_position: number | null; sort_order: number } | null = null;

  if (!target && body?.new_playlist) {
    const requested = typeof body?.new_playlist_name === "string" ? body.new_playlist_name.trim() : "";
    const name = (requested || playlistTitle || "Yeni Playlist").slice(0, 40);

    const { data: last } = await supabaseAdmin
      .from("playlists")
      .select("sort_order")
      .eq("venue_id", session.venue_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error: createErr } = await supabaseAdmin
      .from("playlists")
      .insert({
        venue_id: session.venue_id,
        name,
        is_active: false,
        sort_order: (last?.sort_order ?? -1) + 1,
      })
      .select("id, name, queue_position, sort_order")
      .single();

    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? "Playlist oluşturulamadı" }, { status: 500 });
    }
    createdPlaylist = created;
    target = created.id;
  }

  if (!target) {
    target = (await getDefaultPlaylistId(session.venue_id)) ?? "";
    if (!target) {
      return NextResponse.json({ error: "Mekanın playlist'i bulunamadı" }, { status: 500 });
    }
  }

  const { data: songRows, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(rows, { onConflict: "youtube_video_id" })
    .select("id, title, artist, channel_title");

  if (songErr || !songRows) {
    return NextResponse.json({ error: songErr?.message ?? "Şarkılar kaydedilemedi" }, { status: 500 });
  }

  let result;
  try {
    result = await attachSongsToPlaylist(session.venue_id, target, songRows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Şarkılar eklenemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Kaynağı hatırla: URL saklanır, günlük senkron buradan yürür.
  // snapshot ham kimlik listesidir (embed'e kapalı videolar dahil) — "bu şarkıyı
  // zaten gördük" ölçütü budur, mekanın elle sildiği şarkı geri gelmesin diye
  // playlist_songs'tan ayrı durur.
  const { error: sourceErr } = await supabaseAdmin.from("playlist_sources").upsert(
    {
      playlist_id: target,
      venue_id: session.venue_id,
      youtube_playlist_id: playlistId,
      auto_sync: autoSync,
      snapshot_video_ids: videoIds,
      last_item_count: itemCount,
      last_synced_at: new Date().toISOString(),
      last_added: result.added,
      unchanged_streak: 0,
      next_check_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fail_count: 0,
      last_error: null,
    },
    { onConflict: "playlist_id" }
  );

  return NextResponse.json({
    added: result.added,
    skipped: result.skipped,
    resolved_suggestions: result.resolvedSuggestions,
    playlist_id: target,
    playlist: createdPlaylist,
    auto_sync: autoSync && !sourceErr,
  });
}
