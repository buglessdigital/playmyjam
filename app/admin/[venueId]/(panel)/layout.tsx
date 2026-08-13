import type { Metadata } from "next";
import AdminPanelShell from "@/components/admin/AdminPanelShell";
import { getVenueBranding } from "@/lib/venue-cache";

// Kabuğun kendisi istemcide (AdminPanelShell); bu dosya sunucuda kalıyor ki
// panelin metadata'sı mekana göre üretilebilsin: kök manifest yerine mekanın
// kendi manifest'i bağlanır, böylece "yükle" denince cihaza bu mekanın paneli
// ayrı bir uygulama olarak kurulur.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ venueId: string }>;
}): Promise<Metadata> {
  const { venueId } = await params;
  const venue = await getVenueBranding(venueId);
  const name = venue?.name ?? "PlayMyJam";
  const base = `/admin/${venueId}`;

  return {
    title: `${name} · Panel`,
    manifest: `${base}/manifest.webmanifest`,
    // iOS manifest'teki ikon/adı kullanmaz; ana ekrana eklerken bu ikiliye bakar.
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: name,
    },
    icons: {
      apple: [{ url: `${base}/app-icon/192.png`, sizes: "192x192" }],
    },
  };
}

export default function AdminPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}) {
  // params bilerek çözülmüyor: kabuk statik kalsın, mekan kimliğini istemci
  // tarafındaki Suspense sınırları çözsün.
  return <AdminPanelShell params={params}>{children}</AdminPanelShell>;
}
