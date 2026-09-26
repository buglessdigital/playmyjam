import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVenueBranding } from "@/lib/venue-cache";
import VenueLayoutClient from "./VenueLayoutClient";

// Bilinen mekan slug'ları build'de örnek param olarak kullanılır: unstable_instant
// doğrulaması bu değerlerle çalışır ve mekan kabukları statik HTML olarak üretilir.
// Yeni mekanlar ilk istekte render edilip diske kaydedilir (dynamicParams varsayılanı).
export async function generateStaticParams() {
  const { data } = await supabaseAdmin.from("venues").select("slug");
  const slugs = ((data ?? []) as { slug: string }[]).map((v) => ({ venueId: v.slug }));
  // Liste BOŞ olamaz (cacheComponents build hatası verir) — boş test veritabanında
  // da build alınabilsin diye hiç mekan yoksa bir örnek yeter.
  return slugs.length > 0 ? slugs : [{ venueId: "ornek" }];
}

// Kök manifest yerine mekanın kendi manifest'i bağlanır: müşteri "yükle"
// dediğinde cihazına mekanın adı ve logosuyla, doğrudan bu mekana açılan ayrı
// bir uygulama iner. iOS'ta bildirim ancak bu kurulumla çalışıyor.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ venueId: string }>;
}): Promise<Metadata> {
  const { venueId } = await params;
  const venue = await getVenueBranding(venueId);
  const name = venue?.name ?? "PlayMyJam";
  const base = `/venue/${venueId}`;

  return {
    title: `${name} · PlayMyJam`,
    manifest: `${base}/manifest.webmanifest`,
    // iOS manifest'teki ikon/adı kullanmaz; ana ekrana eklerken bu ikiliye bakar.
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: name },
    icons: { apple: [{ url: `${base}/app-icon/192.png`, sizes: "192x192" }] },
  };
}

interface Props {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}

export default function VenueLayout({ children, params }: Props) {
  return <VenueLayoutClient params={params}>{children}</VenueLayoutClient>;
}
