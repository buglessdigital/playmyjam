"use client";

import { Suspense, use } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import LegalFooter from "@/components/ui/LegalFooter";
import EnablePushPrompt from "@/components/notifications/EnablePushPrompt";
import NotificationWatcher from "@/components/notifications/NotificationWatcher";

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
      <main className={`w-full ${isLoginPage ? "" : "pb-16"}`}>
        {children}
        <LegalFooter hidePayment={isQueuePage} />
      </main>
      {!isLoginPage && (
        <>
          <NotificationWatcher venueId={venueId} />
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
