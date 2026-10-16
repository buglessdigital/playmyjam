import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";
import SettingsClient from "./SettingsClient";

// İnce sunucu sarmalayıcı: sayfanın kendisi istemcide (SettingsClient). Bkz.
// components/admin/DynamicMetadataMarker.tsx
export default function Page() {
  return (
    <>
      <SettingsClient />
      <DynamicMetadataMarker />
    </>
  );
}
