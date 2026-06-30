import { Suspense } from "react";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen" style={{ background: "#0f0a18" }}>
      <Suspense>
        <SuperAdminSidebar />
      </Suspense>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
