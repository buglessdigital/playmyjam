import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";
import DashboardClient from "./DashboardClient";

// İnce sunucu sarmalayıcı: sayfanın kendisi istemcide (DashboardClient). Bkz.
// components/admin/DynamicMetadataMarker.tsx
export default function Page({ params }: { params: Promise<{ venueId: string }> }) {
  return (
    <>
      <DashboardClient params={params} />
      <DynamicMetadataMarker />
    </>
  );
}
