import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";
import StatsClient from "./StatsClient";

// İnce sunucu sarmalayıcı: sayfanın kendisi istemcide (StatsClient). Bkz.
// components/admin/DynamicMetadataMarker.tsx
export default function Page() {
  return (
    <>
      <StatsClient />
      <DynamicMetadataMarker />
    </>
  );
}
