import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveMatchingSuggestions, type MatchableSong } from "@/lib/suggestions";
import type { SongInput } from "@/lib/validate";

export type PlaylistRow = {
  id: string;
  venue_id: string;
  name: string;
  // Çalma kuyruğundaki yer; null = sırada değil (0037)
  queue_position: number | null;
  sort_order: number;
};

// Hedef playlist belirtilmediğinde (ör. şarkı isteği kabul edilince) kullanılır:
// çalma kuyruğundaki ilk liste, yoksa en baştaki liste, o da yoksa yeni bir tane
// açılır. Mekanın hiç playlist'i olmaması yalnızca 0026 sonrası açılan mekanlarda
// olabilir; o liste doğrudan kuyruğa girer, yoksa hiç çalmaz.
export async function getDefaultPlaylistId(venueId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("playlists")
    .select("id, queue_position")
    .eq("venue_id", venueId)
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data?.id) return data.id;

  const { data: created } = await supabaseAdmin
    .from("playlists")
    .insert({ venue_id: venueId, name: "Playlist 1", is_active: true, sort_order: 0, queue_position: 1 })
    .select("id")
    .single();

  return created?.id ?? null;
}

// Playlist'in gerçekten bu mekana ait olduğunu doğrular — istemciden gelen id'ye güvenilmez
export async function assertVenuePlaylist(venueId: string, playlistId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("playlists")
    .select("id")
    .eq("id", playlistId)
    .eq("venue_id", venueId)
    .maybeSingle();
  return !!data;
}

export type AttachableSong = MatchableSong;

// Liste içi sıra (0032): sıralı modda şarkılar bu sırayla çalar. Yeni şarkı hep
// listenin sonuna eklenir — içe aktarımda kaynak listenin sırası korunur.
async function nextPlaylistPosition(playlistId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("playlist_songs")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.position ?? 0) + 1;
}

// Hazır songs satırlarını topluca mekanın kataloguna + hedef playlist'e bağlar.
// Toplu içe aktarım (YouTube playlist) ve günlük otomatik senkron aynı yoldan
// geçsin diye ortak: "zaten var" ölçütü HEDEF LİSTEDEKİ üyeliktir — aynı şarkı
// başka bir listede duruyor olabilir, katalog satırı o zaman korunur (play_count
// kaybolmaz), yalnızca yeni üyelik açılır.
export async function attachSongsToPlaylist(
  venueId: string,
  playlistId: string,
  songs: AttachableSong[]
): Promise<{ added: number; skipped: number; resolvedSuggestions: number }> {
  if (songs.length === 0) return { added: 0, skipped: 0, resolvedSuggestions: 0 };

  const { data: existing } = await supabaseAdmin
    .from("playlist_songs")
    .select("song_id")
    .eq("playlist_id", playlistId)
    .in("song_id", songs.map((s) => s.id));

  const existingSet = new Set((existing ?? []).map((e) => e.song_id));
  let fresh = songs.filter((s) => !existingSet.has(s.id));
  if (fresh.length === 0) return { added: 0, skipped: songs.length, resolvedSuggestions: 0 };

  // Son kapı: toplu içe aktarım ve senkron buradan geçer. Çağıranlar embed'e
  // kapalı videoyu zaten eliyor ama kara liste tek noktada da doğrulanmalı —
  // aksi halde yarın eklenen üçüncü bir yol kataloğu yeniden kirletebilir.
  const { data: blocked } = await supabaseAdmin
    .from("songs")
    .select("id")
    .eq("embeddable", false)
    .in("id", fresh.map((s) => s.id));

  if (blocked?.length) {
    const blockedSet = new Set(blocked.map((b) => b.id));
    fresh = fresh.filter((s) => !blockedSet.has(s.id));
    if (fresh.length === 0) return { added: 0, skipped: songs.length, resolvedSuggestions: 0 };
  }

  const { error: catalogErr } = await supabaseAdmin.from("venue_songs").upsert(
    fresh.map((s) => ({ venue_id: venueId, song_id: s.id, play_count: 0, in_venue_list: true })),
    { onConflict: "venue_id,song_id", ignoreDuplicates: true }
  );
  if (catalogErr) throw new Error(catalogErr.message);

  const basePosition = await nextPlaylistPosition(playlistId);

  const { error: memberErr } = await supabaseAdmin.from("playlist_songs").upsert(
    fresh.map((s, i) => ({
      venue_id: venueId,
      playlist_id: playlistId,
      song_id: s.id,
      position: basePosition + i,
    })),
    { onConflict: "playlist_id,song_id", ignoreDuplicates: true }
  );
  if (memberErr) throw new Error(memberErr.message);

  revalidateTag(`venue-songs-${venueId}`, "max");

  // Mekan, müşterinin serbest metin önerisini listesine eklemiş olabilir:
  // eşleşen bekleyen öneriler burada kendiliğinden kapanır
  const resolvedSuggestions = await resolveMatchingSuggestions(venueId, fresh).catch(() => 0);

  return { added: fresh.length, skipped: songs.length - fresh.length, resolvedSuggestions };
}

// Embed'e kapalı bulunan şarkıyı TÜM mekanların kataloğundan ve playlist'lerinden
// söker. songs satırı bilerek bırakılır: hem çalma geçmişi (queue) ona bağlıdır,
// hem de embeddable=false'ın kendisi kara listedir — satır silinseydi bir sonraki
// playlist senkronu videoyu "yeni" sanıp geri koyardı.
export async function purgeUnplayableSong(songId: string): Promise<void> {
  const { data: affected } = await supabaseAdmin
    .from("playlist_songs")
    .delete()
    .eq("song_id", songId)
    .select("venue_id");

  // 0026 trigger'ı son playlist üyeliği gidince venue_songs satırını düşürür,
  // ama şarkı playlist'e hiç girmeden doğrudan kataloğa eklenmiş olabilir
  const { data: catalogRows } = await supabaseAdmin
    .from("venue_songs")
    .delete()
    .eq("song_id", songId)
    .select("venue_id");

  const venueIds = new Set([
    ...(affected ?? []).map((r) => r.venue_id),
    ...(catalogRows ?? []).map((r) => r.venue_id),
  ]);
  for (const venueId of venueIds) revalidateTag(`venue-songs-${venueId}`, "max");
}

// Kaynak YouTube listesinden çıkarılmış videoları hedef playlist'ten düşürür.
// Yalnızca video kimliğiyle çağrılır: mekanın elle eklediği şarkılar bu yoldan
// asla silinmez, çünkü çağıran taraf yalnızca snapshot'ta (yani bir zamanlar
// YouTube'dan gelmiş) olup artık listede olmayan kimlikleri verir.
// Katalog satırı (venue_songs) son üyelik gidince 0026'daki trigger ile düşer —
// şarkı başka bir listede duruyorsa play_count korunur.
export async function detachVideosFromPlaylist(
  venueId: string,
  playlistId: string,
  videoIds: string[]
): Promise<number> {
  if (videoIds.length === 0) return 0;

  const songIds: string[] = [];
  for (let i = 0; i < videoIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select("id")
      .in("youtube_video_id", videoIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) songIds.push(row.id);
  }
  if (songIds.length === 0) return 0;

  let removed = 0;
  for (let i = 0; i < songIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("playlist_songs")
      .delete()
      .eq("venue_id", venueId)
      .eq("playlist_id", playlistId)
      .in("song_id", songIds.slice(i, i + 200))
      .select("song_id");
    if (error) throw new Error(error.message);
    removed += data?.length ?? 0;
  }

  if (removed > 0) revalidateTag(`venue-songs-${venueId}`, "max");
  return removed;
}

// songs'a upsert eder, mekan kataloguna (venue_songs) ve hedef playlist'e ekler.
// Katalog satırı zaten varsa korunur (play_count/in_venue_list kaybolmaz), yalnızca
// playlist üyeliği eklenir; şarkı o playlist'te zaten varsa 409 döner.
export async function addSongToVenuePlaylist(
  venueId: string,
  song: SongInput,
  playlistId?: string
): Promise<{ venueSongId: string; songId: string; playlistId: string } | { error: string; status: number }> {
  const targetPlaylistId = playlistId ?? (await getDefaultPlaylistId(venueId));
  if (!targetPlaylistId) {
    return { error: "Mekanın playlist'i bulunamadı", status: 500 };
  }

  const { data: songRow, error: songErr } = await supabaseAdmin
    .from("songs")
    .upsert(
      {
        youtube_video_id: song.youtube_video_id,
        title: song.title,
        artist: song.artist,
        album_cover_url: song.album_cover_url,
        duration_ms: song.duration_ms,
      },
      { onConflict: "youtube_video_id" }
    )
    .select("id, embeddable")
    .single();

  if (songErr || !songRow) {
    return { error: songErr?.message ?? "Şarkı kaydedilemedi", status: 500 };
  }

  // Kara liste: upsert embeddable'a dokunmaz, yani bir kez kapalı işaretlenen
  // video bu yoldan (panelden elle ekleme / öneri kabulü) geri giremez.
  if (songRow.embeddable === false) {
    await purgeUnplayableSong(songRow.id);
    return { error: "Bu şarkı YouTube'da dış oynatıcıya kapalı, kataloğa eklenemez", status: 422 };
  }

  const { data: existingMember } = await supabaseAdmin
    .from("playlist_songs")
    .select("id")
    .eq("playlist_id", targetPlaylistId)
    .eq("song_id", songRow.id)
    .maybeSingle();

  if (existingMember) {
    return { error: "Bu şarkı zaten bu playlist'te mevcut", status: 409 };
  }

  // Katalog satırı: başka bir playlist üzerinden zaten varsa dokunma
  const { data: venueSong, error: vsErr } = await supabaseAdmin
    .from("venue_songs")
    .upsert(
      { venue_id: venueId, song_id: songRow.id, play_count: 0, in_venue_list: true },
      { onConflict: "venue_id,song_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (vsErr) {
    return { error: vsErr.message, status: 500 };
  }

  let venueSongId = venueSong?.id ?? "";
  if (!venueSongId) {
    const { data: existingVs } = await supabaseAdmin
      .from("venue_songs")
      .select("id")
      .eq("venue_id", venueId)
      .eq("song_id", songRow.id)
      .maybeSingle();
    if (!existingVs) {
      return { error: "Katalog satırı oluşturulamadı", status: 500 };
    }
    venueSongId = existingVs.id;
  }

  const { error: memberErr } = await supabaseAdmin.from("playlist_songs").insert({
    venue_id: venueId,
    playlist_id: targetPlaylistId,
    song_id: songRow.id,
    position: await nextPlaylistPosition(targetPlaylistId),
  });

  if (memberErr) {
    return { error: memberErr.message, status: 500 };
  }

  // Bu şarkıyı bekleyen serbest metin öneriler varsa kendiliğinden kapansın
  await resolveMatchingSuggestions(venueId, [
    { id: songRow.id, title: song.title, artist: song.artist },
  ]).catch(() => 0);

  return { venueSongId, songId: songRow.id, playlistId: targetPlaylistId };
}
