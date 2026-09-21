import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { readHubForAdmin, readHubStats } from "@/lib/hub-server";
import { HUB_KINDS, HUB_KIND_META, hubLinkError, type HubKind, type HubLink } from "@/lib/hub";

/**
 * Mekan sayfasının (plaket arka yüzü) panel ucu.
 *
 * Hizmetin AÇIK olup olmadığına mekan değil super admin karar verir
 * (venues.hub_enabled, anlaşma sırasında girilir). Kapalıysa bu uç 403 döner;
 * panelde de menü satırı hiç görünmez.
 *
 * PUT tüm listeyi birden alır: satır ekleme/çıkarma/sıralama tek kayıtta biter,
 * yarım kalmış bir ekran olmaz.
 */

const MAX_LINKS = 12;
const MAX_LABEL = 60;
const MAX_VALUE = 500;
const MAX_NOTE = 120;
const MAX_HEADLINE = 140;

type Incoming = {
  id?: unknown;
  kind: string;
  label?: unknown;
  value?: unknown;
  note?: unknown;
  enabled?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? null : trimmed;
}

export async function GET(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const hub = await readHubForAdmin(session.venue_id);
  if (!hub) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  if (!hub.enabled) {
    // Hizmet kapalı: satırları hiç göstermeden durumu bildir, panel açıklayıcı
    // bir ekran çizsin
    return NextResponse.json({ enabled: false, slug: "", headline: "", links: [], stats: null });
  }

  const stats = await readHubStats(session.venue_id);
  return NextResponse.json({ ...hub, slug: session.venue_slug, stats });
}

export async function PUT(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const current = await readHubForAdmin(session.venue_id);
  if (!current) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });
  if (!current.enabled) {
    return NextResponse.json(
      { error: "Mekan sayfası hizmeti bu mekan için açık değil" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const rawLinks: unknown = body?.links;
  if (!Array.isArray(rawLinks)) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (rawLinks.length > MAX_LINKS) {
    return NextResponse.json({ error: `En fazla ${MAX_LINKS} satır ekleyebilirsiniz` }, { status: 400 });
  }

  const headline = str(body?.headline, MAX_HEADLINE);
  if (headline === null) {
    return NextResponse.json({ error: `Tanıtım yazısı en fazla ${MAX_HEADLINE} karakter olabilir` }, { status: 400 });
  }

  // Panel mevcut satırları kimlikleriyle geri yollar: böylece bir satır
  // düzenlendiğinde kimliği (ve tıklama sayaçları) korunur.
  const existing = new Set(current.links.map((l) => l.id));

  type Row = {
    id: string;
    venue_id: string;
    kind: HubKind;
    label: string;
    value: string;
    note: string;
    enabled: boolean;
    position: number;
    updated_at: string;
  };

  const now = new Date().toISOString();
  const rows: Row[] = [];
  const seenKinds = new Set<string>();
  const keptIds: string[] = [];

  for (const [i, raw] of (rawLinks as Incoming[]).entries()) {
    const kind = raw?.kind;
    if (typeof kind !== "string" || !(HUB_KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ error: "Tanınmayan satır türü" }, { status: 400 });
    }
    const label = str(raw.label, MAX_LABEL);
    const value = str(raw.value, MAX_VALUE);
    const note = str(raw.note, MAX_NOTE);
    if (label === null || value === null || note === null) {
      return NextResponse.json({ error: "Girilen metinlerden biri çok uzun" }, { status: 400 });
    }

    const error = hubLinkError({ kind: kind as HubKind, label, value } satisfies Pick<HubLink, "kind" | "label" | "value">);
    if (error) return NextResponse.json({ error: `${HUB_KIND_META[kind as HubKind].title}: ${error}` }, { status: 400 });

    // 'custom' dışındaki türler mekan başına tek satır (veritabanındaki tekil
    // dizinle aynı kural) — arayüz zaten engelliyor, burası son savunma
    if (kind !== "custom") {
      if (seenKinds.has(kind)) {
        return NextResponse.json({ error: "Aynı türden iki satır eklenemez" }, { status: 400 });
      }
      seenKinds.add(kind);
    }

    // Başka mekanın kimliği gönderilirse yok sayılır, satır yeniden oluşturulur.
    // Yeni satıra da BURADA kimlik veriliyor: toplu upsert'te her satırın aynı
    // alanlara sahip olması gerekiyor (PostgREST kuralı). Bir satırda id olup
    // diğerinde olmaması tüm kaydı düşürüyordu.
    const kept = typeof raw.id === "string" && UUID_RE.test(raw.id) && existing.has(raw.id) ? raw.id : null;
    if (kept) keptIds.push(kept);

    rows.push({
      id: kept ?? crypto.randomUUID(),
      venue_id: session.venue_id,
      kind: kind as HubKind,
      label,
      value,
      note,
      enabled: raw.enabled !== false,
      position: i,
      updated_at: now,
    });
  }

  // Panelden kaldırılan satırları sil. ÖNCE silinir: bir tür kaldırılıp aynı
  // tür yeni bir satır olarak eklendiyse tekil dizin çakışmasın.
  const removed = current.links.filter((l) => !keptIds.includes(l.id)).map((l) => l.id);
  if (removed.length > 0) {
    const { error } = await supabaseAdmin
      .from("venue_hub_links")
      .delete()
      .eq("venue_id", session.venue_id)
      .in("id", removed);
    if (error) {
      console.error("[hub] satır silinemedi:", error.message);
      return NextResponse.json({ error: "Satırlar güncellenemedi" }, { status: 500 });
    }
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from("venue_hub_links").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("[hub] satırlar kaydedilemedi:", error.message);
      return NextResponse.json({ error: "Satırlar kaydedilemedi" }, { status: 500 });
    }
  }

  if (headline !== current.headline) {
    await supabaseAdmin
      .from("venues")
      .update({ hub_headline: headline })
      .eq("id", session.venue_id);
  }

  revalidateTag(`hub-${session.venue_slug}`, "max");

  const fresh = await readHubForAdmin(session.venue_id);
  const stats = await readHubStats(session.venue_id);
  return NextResponse.json({ ...fresh, slug: session.venue_slug, stats });
}
