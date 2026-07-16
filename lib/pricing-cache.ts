import { cacheLife, cacheTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TokenPackage = { id: string; label: string; tokens: number; price: number; popular: boolean };

// Fiyatlandırma yalnızca super admin panelinden değişir; ikisi de aynı tag'le
// cache'lenir ve panel kaydında revalidateTag("global-pricing","max") ile tazelenir.
// NOT: purchase route para hesabında bu cache'i DEĞİL, doğrudan DB'yi okur.
export async function getTokenUnitPrice(): Promise<number> {
  "use cache";
  cacheLife("minutes");
  cacheTag("global-pricing");

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "token_unit_price")
    .maybeSingle();

  const price = Number(data?.value);
  return Number.isFinite(price) && price > 0 ? price : 30;
}

export async function getGlobalTokenPackages(): Promise<TokenPackage[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("global-pricing");

  const { data } = await supabaseAdmin
    .from("global_token_packages")
    .select("id, label, tokens, price, popular")
    .order("display_order");

  return (data ?? []) as TokenPackage[];
}
