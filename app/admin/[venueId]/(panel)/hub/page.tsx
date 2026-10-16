import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";
import HubClient from "./HubClient";

// İnce sunucu sarmalayıcı: sayfanın kendisi istemcide (HubClient). Bkz.
// components/admin/DynamicMetadataMarker.tsx
export default function Page() {
  return (
    <>
      <HubClient />
      <DynamicMetadataMarker />
    </>
  );
}
