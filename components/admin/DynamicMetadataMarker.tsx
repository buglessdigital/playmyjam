import { Suspense } from "react";
import { connection } from "next/server";

// Panelin generateMetadata'sı (app/admin/[venueId]/(panel)/layout.tsx)
// params'ı okuyor: mekan adı ve mekana özel manifest. Kabuk ve sayfalar ise
// bilerek statik. Next 16 bu ikiliyi "statik sayfada bekletilen metadata"
// diye geliştirme ekranında hata olarak gösteriyordu. Bu işaretçi metadata'nın
// istek anında akmasının bilinçli olduğunu söyler; hiçbir şey çizmez,
// Suspense içinde olduğu için statik ön-render'ı bozmaz.
//
// Nereye konur: Next'in gezinme denetimi her panel sayfasını kendi segmentinde
// ayrı denetliyor ve üstteki düzenleri (alt klasör layout'ları dahil) "zaten
// ekranda" sayıyor — işaretçi düzende dururken o denetimden geçmiyordu. Bu
// yüzden her panel sayfasının page.tsx'i ince bir sunucu sarmalayıcı: istemci
// bileşenini (…Client.tsx) ve bu işaretçiyi çizer. Yeni panel sayfası
// eklenirse aynı kalıp gerekir.
async function Connection() {
  await connection();
  return null;
}

export default function DynamicMetadataMarker() {
  return (
    <Suspense>
      <Connection />
    </Suspense>
  );
}
