import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";
import RequestsClient from "./RequestsClient";

// İnce sunucu sarmalayıcı: sayfanın kendisi istemcide (RequestsClient). Bkz.
// components/admin/DynamicMetadataMarker.tsx
export default function Page({ params }: { params: Promise<{ venueId: string }> }) {
  return (
    <>
      <RequestsClient params={params} />
      <DynamicMetadataMarker />
    </>
  );
}
