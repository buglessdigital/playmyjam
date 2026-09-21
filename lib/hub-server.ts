import { cacheLife, cacheTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeVenueSlug, type HubKind, type HubLink } from "@/lib/hub";

export type HubPage = {
  venueId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  headline: string;
  links: HubLink[];
};

type VenueRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  tagline: string | null;
  hub_enabled: boolean;
  hub_headline: string | null;
};

type LinkRow = {
  id: string;
  kind: HubKind;
  label: string | null;
  value: string | null;
  note: string | null;
  enabled: boolean;
  position: number;
};

function toLink(row: LinkRow): HubLink {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label ?? "",
    value: row.value ?? "",
    note: row.note ?? "",
    enabled: row.enabled,
    position: row.position,
  };
}

/**
 * Mekanın slug'ıyla mekan sayfası. Slug DEĞİŞTİRİLEMEZ (super admin formunda da
 * öyle yazıyor), bu yüzden plakete basılan adres bozulmaz.
 *
 * Hizmet kapalıysa (hub_enabled = false) null döner — sayfa 404 olur. Mekan
 * hizmeti almıyorsa arka yüz QR'ı zaten basılmaz; yanlışlıkla paylaşılan bir
 * bağlantı da boş bir sayfa göstermez.
 */
export async function getHubPage(slug: string): Promise<HubPage | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`hub-${slug}`);

  const safe = sanitizeVenueSlug(slug);
  if (!safe) return null;

  const { data } = await supabaseAdmin
    .from("venues")
    .select("id, slug, name, logo_url, tagline, hub_enabled, hub_headline")
    .eq("slug", safe)
    .maybeSingle<VenueRow>();

  if (!data || !data.hub_enabled) return null;

  const { data: rows } = await supabaseAdmin
    .from("venue_hub_links")
    .select("id, kind, label, value, note, enabled, position")
    .eq("venue_id", data.id)
    .eq("enabled", true)
    .order("position")
    .order("created_at");

  return {
    venueId: data.id,
    slug: data.slug,
    name: data.name,
    logoUrl: data.logo_url,
    headline: (data.hub_headline ?? "").trim() || (data.tagline ?? "").trim(),
    // Değeri boş kalmış satır sayfada yer kaplamasın
    links: ((rows ?? []) as LinkRow[]).map(toLink).filter((l) => l.value.trim() !== ""),
  };
}

/** Panelin ve super admin'in okuduğu ham hali — kapalı satırlar dahil. */
export async function readHubForAdmin(venueDbId: string): Promise<{
  enabled: boolean;
  headline: string;
  links: HubLink[];
} | null> {
  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("hub_enabled, hub_headline")
    .eq("id", venueDbId)
    .maybeSingle<Pick<VenueRow, "hub_enabled" | "hub_headline">>();

  if (!venue) return null;

  const { data: rows } = await supabaseAdmin
    .from("venue_hub_links")
    .select("id, kind, label, value, note, enabled, position")
    .eq("venue_id", venueDbId)
    .order("position")
    .order("created_at");

  return {
    enabled: venue.hub_enabled === true,
    headline: venue.hub_headline ?? "",
    links: ((rows ?? []) as LinkRow[]).map(toLink),
  };
}

/** Son 30 günün sayfa görüntülemesi ve satır başına tıklama sayısı. */
export async function readHubStats(venueDbId: string): Promise<{
  views: number;
  clicks: Record<string, number>;
}> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [views, clicks] = await Promise.all([
    supabaseAdmin
      .from("venue_hub_views")
      .select("count")
      .eq("venue_id", venueDbId)
      .gte("day", since),
    supabaseAdmin
      .from("venue_hub_link_clicks")
      .select("link_id, count")
      .eq("venue_id", venueDbId)
      .gte("day", since),
  ]);

  const perLink: Record<string, number> = {};
  for (const row of (clicks.data ?? []) as { link_id: string; count: number }[]) {
    perLink[row.link_id] = (perLink[row.link_id] ?? 0) + row.count;
  }

  return {
    views: ((views.data ?? []) as { count: number }[]).reduce((sum, r) => sum + r.count, 0),
    clicks: perLink,
  };
}
