"use client";

import BottomNav from "@/components/ui/BottomNav";
import NotificationWatcher from "@/components/notifications/NotificationWatcher";
import { use } from "react";
import { usePathname } from "next/navigation";

interface Props {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}

export default function VenueLayout({ children, params }: Props) {
  const { venueId } = use(params);
  const pathname = usePathname();
  const isLoginPage = pathname === `/venue/${venueId}`;

  return (
    <div className="relative min-h-screen w-full bg-[#0f0a18]">
      <main className={`w-full ${isLoginPage ? "" : "pb-16"}`}>{children}</main>
      {!isLoginPage && <NotificationWatcher venueId={venueId} />}
      {!isLoginPage && <BottomNav venueId={venueId} />}
    </div>
  );
}
