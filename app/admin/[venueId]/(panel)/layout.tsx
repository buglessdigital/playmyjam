"use client";

import { Suspense, use } from "react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import GoogleLinkBanner from "@/components/admin/GoogleLinkBanner";

export default function AdminPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}) {
  return (
    // Ana ekran kendi içinde kaydığı için sayfanın tamamı ekran boyunda sabit;
    // kaydırma alt panolara bırakılır (alt bar hep görünür kalsın diye).
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden" style={{ background: "#0f0a18" }}>
      <Suspense fallback={null}>
        <AdminSidebarResolved params={params} />
      </Suspense>
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Suspense fallback={null}>
          <GoogleLinkBannerResolved params={params} />
        </Suspense>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}

function AdminSidebarResolved({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = use(params);
  return <AdminSidebar venueId={venueId} />;
}

function GoogleLinkBannerResolved({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = use(params);
  return <GoogleLinkBanner venueId={venueId} />;
}
