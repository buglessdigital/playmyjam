import { NextRequest, NextResponse } from "next/server";
import { getSuperSession } from "@/lib/session";
import {
  deletePmjPlaylist,
  getPmjPlaylistSongs,
  listPmjPlaylists,
  removeSongFromPmjPlaylist,
  renamePmjPlaylist,
  savePmjPlaylist,
} from "@/lib/pmj-playlists";

// Super admin "PMJ Listeleri" ekranı (0081). İçe aktarım önizlemesi ayrı uçta
// (./import); burası kaydetme, ad değiştirme, şarkı çıkarma ve silme.

// Kaydetme listeyi açmış bütün mekanları da günceller — mekan sayısı arttıkça uzar
export const maxDuration = 300;

const deny = () => NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
const fail = (err: unknown, status = 500) =>
  NextResponse.json({ error: err instanceof Error ? err.message : "İşlem başarısız" }, { status });

export async function GET(req: NextRequest) {
  if (!getSuperSession(req)) return deny();
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) return NextResponse.json({ songs: await getPmjPlaylistSongs(id) });
    return NextResponse.json({ playlists: await listPmjPlaylists() });
  } catch (err) {
    return fail(err);
  }
}

// { name, song_ids } — aynı adda liste varsa içeriği değiştirilir
export async function POST(req: NextRequest) {
  if (!getSuperSession(req)) return deny();
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const songIds = Array.isArray(body?.song_ids)
    ? body.song_ids.filter((id: unknown): id is string => typeof id === "string")
    : [];
  if (!name.trim() || songIds.length === 0) {
    return NextResponse.json({ error: "Liste adı ve en az bir şarkı gerekli" }, { status: 400 });
  }
  try {
    return NextResponse.json(await savePmjPlaylist(name, songIds));
  } catch (err) {
    return fail(err);
  }
}

// { id, name } ad değiştirir; { id, remove_song_id } şarkı çıkarır
export async function PATCH(req: NextRequest) {
  if (!getSuperSession(req)) return deny();
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  try {
    if (typeof body?.name === "string") await renamePmjPlaylist(id, body.name);
    else if (typeof body?.remove_song_id === "string") await removeSongFromPmjPlaylist(id, body.remove_song_id);
    else return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, 400);
  }
}

export async function DELETE(req: NextRequest) {
  if (!getSuperSession(req)) return deny();
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, venues: await deletePmjPlaylist(id) });
  } catch (err) {
    return fail(err);
  }
}
