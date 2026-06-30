"use client";

import { Suspense, use } from "react";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen" style={{ background: "#0f0a18" }}>
      <Suspense fallback={null}>
        <AdminSidebarResolved params={params} />
      </Suspense>
      <main className="flex-1 min-w-0 overflow-auto pb-6">{children}</main>
    </div>
  );
}

function AdminSidebarResolved({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = use(params);
  return <AdminSidebar venueId={venueId} />;
}
