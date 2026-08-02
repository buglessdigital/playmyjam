import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { getPlaylistItems, getPlaylistTitle, parsePlaylistId, YouTubeQuotaError } from "@/lib/youtube";
import { resolveMatchingSuggestions } from "@/lib/suggestions";
import { assertVenuePlaylist, getDefaultPlaylistId } from "@/lib/playlist";

// Public YouTube playlist'indeki tüm şarkıları mekanın bir playlist'ine toplu ekler.
// OAuth gerekmez — admin playlist URL'sini yapıştırır.
// Hedef: body.playlist_id (mevcut liste) | body.new_playlist (yeni liste açılır) | varsayılan.
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

  let tracks;
  try {
    tracks = await getPlaylistItems(playlistId);
  } catch (err) {
    if (err instanceof YouTubeQuotaError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json(
      { error: "Playlist alınamadı — bağlantının herkese açık olduğundan emin olun" },
      { status: 400 }
    );
  }

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
  // liste (pasif başlar), hiçbiri yoksa mekanın varsayılan listesi
  let target = targetId;
  let createdPlaylist: { id: string; name: string; is_active: boolean; sort_order: number } | null = null;

  if (!target && body?.new_playlist) {
    const requested = typeof body?.new_playlist_name === "string" ? body.new_playlist_name.trim() : "";
    const name = (requested || (await getPlaylistTitle(playlistId)) || "Yeni Playlist").slice(0, 40);

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
      .select("id, name, is_active, sort_order")
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

  // "Zaten var" ölçütü hedef listedeki üyelik: aynı şarkı başka listede olabilir
  const { data: existing } = await supabaseAdmin
    .from("playlist_songs")
    .select("song_id")
    .eq("playlist_id", target)
    .in("song_id", songRows.map((r) => r.id));

  const existingSet = new Set((existing ?? []).map((e) => e.song_id));
  const newSongs = songRows.filter((r) => !existingSet.has(r.id));

  let resolved = 0;
  if (newSongs.length > 0) {
    // Katalog satırı: başka listeden zaten varsa korunur (play_count kaybolmaz)
    const { error: catalogErr } = await supabaseAdmin.from("venue_songs").upsert(
      newSongs.map((r) => ({
        venue_id: session.venue_id,
        song_id: r.id,
        play_count: 0,
        in_venue_list: true,
      })),
      { onConflict: "venue_id,song_id", ignoreDuplicates: true }
    );
    if (catalogErr) {
      return NextResponse.json({ error: catalogErr.message }, { status: 500 });
    }

    const { error: insErr } = await supabaseAdmin.from("playlist_songs").insert(
      newSongs.map((r) => ({ venue_id: session.venue_id, playlist_id: target, song_id: r.id }))
    );
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    revalidateTag(`venue-songs-${session.venue_id}`, "max");

    // Mekan, müşteri önerisini playlist'ine ekleyip yeniden içe aktarmış olabilir:
    // eşleşen bekleyen öneriler burada kendiliğinden kapanır
    resolved = await resolveMatchingSuggestions(session.venue_id, newSongs).catch(() => 0);
  }

  return NextResponse.json({
    added: newSongs.length,
    skipped: songRows.length - newSongs.length,
    resolved_suggestions: resolved,
    playlist_id: target,
    playlist: createdPlaylist,
  });
}
