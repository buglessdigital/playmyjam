import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { resetAutoQueue } from "@/lib/queue-fill";

const MAX_NAME = 40;

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > MAX_NAME) return null;
  return name;
}

// Yeni playlist. Pasif başlar — admin hazır olunca aktife alır.
export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = parseName(body?.name);
  if (!name) {
    return NextResponse.json({ error: `Playlist adı gerekli (en fazla ${MAX_NAME} karakter)` }, { status: 400 });
  }

  const { data: last } = await supabaseAdmin
    .from("playlists")
    .select("sort_order")
    .eq("venue_id", session.venue_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("playlists")
    .insert({
      venue_id: session.venue_id,
      name,
      is_active: false,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id, name, is_active, sort_order, shuffle")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Playlist oluşturulamadı" }, { status: 500 });
  }
  return NextResponse.json({ playlist: data });
}

// Yeniden adlandırma, aktiflik, liste içi karıştırma; playlist_id olmadan da
// listelerin çalma sırası. Aktiflik değişirse otomatik kuyruk tazelenir.
export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Listelerin çalma sırası: gelen dizi baştan sona sort_order olur. Rotasyon
  // imleci bilerek korunur — sıra değiştirmek çalan listeyi başa sarmaz.
  if (body?.order !== undefined) {
    const order = Array.isArray(body.order) ? body.order.filter((id: unknown) => typeof id === "string") : null;
    if (!order || order.length === 0) {
      return NextResponse.json({ error: "Sıra listesi gerekli" }, { status: 400 });
    }

    const { data: owned } = await supabaseAdmin
      .from("playlists")
      .select("id")
      .eq("venue_id", session.venue_id)
      .in("id", order);

    const ownedIds = new Set((owned ?? []).map((p) => p.id));
    if (ownedIds.size !== order.length) {
      return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
    }

    const results = await Promise.all(
      order.map((id: string, i: number) =>
        supabaseAdmin
          .from("playlists")
          .update({ sort_order: i })
          .eq("id", id)
          .eq("venue_id", session.venue_id)
      )
    );

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  const hasName = body?.name !== undefined;
  const hasActive = typeof body?.is_active === "boolean";
  const hasAutoSync = typeof body?.auto_sync === "boolean";
  const hasShuffle = typeof body?.shuffle === "boolean";
  if (!playlistId || (!hasName && !hasActive && !hasAutoSync && !hasShuffle)) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // Otomatik senkron anahtarı playlist_sources'ta durur — yalnızca YouTube'dan
  // içe aktarılmış listelerde satır vardır, elle kurulan listede açılamaz.
  if (hasAutoSync) {
    const { data: source, error: sourceErr } = await supabaseAdmin
      .from("playlist_sources")
      .update({
        auto_sync: body.auto_sync,
        // Yeniden açılırken hata sayacı sıfırlanır: liste tekrar herkese açık
        // yapılmış olabilir, 10 hatada kapanmış senkron böyle canlanır.
        ...(body.auto_sync ? { fail_count: 0, last_error: null, next_check_at: new Date().toISOString() } : {}),
      })
      .eq("playlist_id", playlistId)
      .eq("venue_id", session.venue_id)
      .select("playlist_id")
      .maybeSingle();

    if (sourceErr) {
      return NextResponse.json({ error: sourceErr.message }, { status: 500 });
    }
    if (!source) {
      return NextResponse.json(
        { error: "Bu liste YouTube'dan içe aktarılmadı — otomatik güncelleme açılamaz" },
        { status: 400 }
      );
    }
    if (!hasName && !hasActive && !hasShuffle) {
      return NextResponse.json({ ok: true });
    }
  }

  const patch: { name?: string; is_active?: boolean; shuffle?: boolean } = {};
  if (hasName) {
    const name = parseName(body.name);
    if (!name) {
      return NextResponse.json({ error: `Playlist adı gerekli (en fazla ${MAX_NAME} karakter)` }, { status: 400 });
    }
    patch.name = name;
  }
  if (hasActive) patch.is_active = body.is_active;
  if (hasShuffle) patch.shuffle = body.shuffle;

  const { data, error } = await supabaseAdmin
    .from("playlists")
    .update(patch)
    .eq("id", playlistId)
    .eq("venue_id", session.venue_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
  }

  // Aktiflik ya da liste içi sıra değişti: bekleyen otomatik şarkılar yeni
  // düzene göre yeniden seçilsin (tüketim de geri alınır, bkz. resetAutoQueue).
  if (hasActive || hasShuffle) {
    await resetAutoQueue(session.venue_id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

// Playlist silme. Üyelikler cascade ile gider; hiçbir listede kalmayan şarkı
// 0026'daki trigger ile katalogdan da düşer.
export async function DELETE(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const playlistId = typeof body?.playlist_id === "string" ? body.playlist_id : "";
  if (!playlistId) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const { data: playlist } = await supabaseAdmin
    .from("playlists")
    .select("id, is_active")
    .eq("id", playlistId)
    .eq("venue_id", session.venue_id)
    .maybeSingle();

  if (!playlist) {
    return NextResponse.json({ error: "Playlist bulunamadı" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("playlists")
    .delete()
    .eq("id", playlistId)
    .eq("venue_id", session.venue_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(`venue-songs-${session.venue_id}`, "max");
  if (playlist.is_active) {
    await resetAutoQueue(session.venue_id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
