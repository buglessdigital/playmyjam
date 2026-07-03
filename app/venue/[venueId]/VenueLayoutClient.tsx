"use client";

import { Suspense, use } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
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
  // Giriş sayfası "/venue/{venueId}" — alt segment yoksa params'ı beklemeden anlaşılır
  const pathname = usePathname();
  const { venueId } = use(params);
  const isLoginPage = pathname === `/venue/${venueId}`;

  return (
    <>
      <main className={`w-full ${isLoginPage ? "" : "pb-16"}`}>{children}</main>
      {!isLoginPage && (
        <>
          <NotificationWatcher venueId={venueId} />
          <BottomNav venueId={venueId} />
        </>
      )}
    </>
  );
}
