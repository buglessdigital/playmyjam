import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";
import ContractsClient from "./ContractsClient";

// İnce sunucu sarmalayıcı: sayfanın kendisi istemcide (ContractsClient). Bkz.
// components/admin/DynamicMetadataMarker.tsx
export default function Page() {
  return (
    <>
      <ContractsClient />
      <DynamicMetadataMarker />
    </>
  );
}
