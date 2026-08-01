import { redirect } from "next/navigation";

// QR'dan gelen adres mekanın kökü. Giriş artık zorunlu değil — ziyaretçi doğrudan
// kuyruğu görür. Normalde proxy bu yönlendirmeyi zaten yapar; burası proxy'nin
// çalışmadığı durumlar için yedek (ve rotanın var olmasını sağlar).
interface Props {
  params: Promise<{ venueId: string }>;
}

export default async function VenueRootPage({ params }: Props) {
  const { venueId } = await params;
  redirect(`/venue/${venueId}/queue`);
}
