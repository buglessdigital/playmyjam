import type { SupabaseClient } from "@supabase/supabase-js";

type VenueRow = { id: string; name: string };

const TTL_MS = 60_000;
const cache = new Map<string, { value: VenueRow | null; expires: number }>();

export async function getVenueBySlug(supabase: SupabaseClient, slug: string): Promise<VenueRow | null> {
  const cached = cache.get(slug);
  if (cached && cached.expires > Date.now()) return cached.value;

  const { data } = await supabase.from("venues").select("id, name").eq("slug", slug).single();
  const value = data ?? null;
  cache.set(slug, { value, expires: Date.now() + TTL_MS });
  return value;
}
