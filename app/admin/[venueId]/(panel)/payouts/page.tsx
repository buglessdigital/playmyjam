import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";
import PayoutsClient from "./PayoutsClient";

// İnce sunucu sarmalayıcı: sayfanın kendisi istemcide (PayoutsClient). Bkz.
// components/admin/DynamicMetadataMarker.tsx
export default function Page() {
  return (
    <>
      <PayoutsClient />
      <DynamicMetadataMarker />
    </>
  );
}
