"use client";

import { Suspense, use } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import LegalFooter from "@/components/ui/LegalFooter";
import EnablePushPrompt from "@/components/notifications/EnablePushPrompt";
import NotificationWatcher from "@/components/notifications/NotificationWatcher";
import RequestStatusBar from "@/components/venue/RequestStatusBar";

interface Props {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}

export default function VenueLayoutClient({ children, params }: Props) {
  return (
    <div className="relative min-h-screen w-full bg-[#0f0a18]">
      <Suspense fallback={<main className="w-full">{children}</main>}>
        <VenueLayoutContent params={params}>{children}</VenueLayoutContent>
      </Suspense>
    </div>
  );
}

function VenueLayoutContent({ children, params }: Props) {
  const pathname = usePathname();
  const { venueId } = use(params);
  // Giriş ve onay ekranlarında alt gezinme ve bildirim izleyici yok:
  // kullanıcı akıştan kaçmadan tamamlasın
  const isLoginPage =
    pathname === `/venue/${venueId}/login` || pathname === `/venue/${venueId}/onay`;
  const isQueuePage = pathname === `/venue/${venueId}/queue`;

  return (
    <>
      {/* Alt boşluk: 4rem alt gezinme + varsa talep şeridinin ölçülen boyu.
          Şerit sabit konumlu olduğu için yerini kendisi açamaz; boyunu
          --pmj-request-bar'a yazar (bkz. components/venue/RequestStatusBar). */}
      <main
        className={`w-full ${isLoginPage ? "" : "pb-16"}`}
        style={isLoginPage ? undefined : { paddingBottom: "calc(4rem + var(--pmj-request-bar, 0px))" }}
      >
        {children}
        <LegalFooter hidePayment={isQueuePage} />
      </main>
      {!isLoginPage && (
        <>
          <NotificationWatcher venueId={venueId} />
          {/* Talep onayı bildirime bakmadan da görülsün (bkz. RequestStatusBar) */}
          <RequestStatusBar venueId={venueId} />
          <BottomNav venueId={venueId} />
          {/* İlk ziyaret anlatımı kaldırıldı: yeni gelen artık modal okumak yerine
              doğrudan aramada başlar (bkz. BrowseClient + lib/first-visit.ts) */}
          {/* Uygulama kipinde açılışta bildirim izni ister (tarayıcı sekmesinde çıkmaz) */}
          <EnablePushPrompt />
        </>
      )}
    </>
  );
}
