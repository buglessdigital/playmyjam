"use client";

import { use } from "react";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = use(params);
  return (
    <div className="flex flex-col md:flex-row min-h-screen" style={{ background: "#0f0a18" }}>
      <AdminSidebar venueId={venueId} />
      <main className="flex-1 min-w-0 overflow-auto pb-6">{children}</main>
    </div>
  );
}
