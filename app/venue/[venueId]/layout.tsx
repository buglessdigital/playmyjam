import { supabaseAdmin } from "@/lib/supabase/admin";
import VenueLayoutClient from "./VenueLayoutClient";

// Bilinen mekan slug'ları build'de örnek param olarak kullanılır: unstable_instant
// doğrulaması bu değerlerle çalışır ve mekan kabukları statik HTML olarak üretilir.
// Yeni mekanlar ilk istekte render edilip diske kaydedilir (dynamicParams varsayılanı).
export async function generateStaticParams() {
  const { data } = await supabaseAdmin.from("venues").select("slug");
  return (data ?? []).map((v: { slug: string }) => ({ venueId: v.slug }));
}

interface Props {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}

export default function VenueLayout({ children, params }: Props) {
  return <VenueLayoutClient params={params}>{children}</VenueLayoutClient>;
}
