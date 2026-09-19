"use client";

import { Suspense, use } from "react";
import ContractDocuments from "@/components/admin/ContractDocuments";

// Mekana gönderilen sözleşme onaylanana kadar panelin hiçbir yeri (player dahil)
// açılmaz — kontrol proxy'de (bkz. lib/venue-documents.ts). Bu ekran panel
// kabuğunun dışında: burada müzik çalmaz. Çıkış yolları: onaylamak ya da çıkış.

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function ContractApprovalPage({ params }: Props) {
  return (
    <Suspense>
      <ContractApproval params={params} />
    </Suspense>
  );
}

function ContractApproval({ params }: Props) {
  const { venueId } = use(params);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    window.location.replace(`/admin/${venueId}/login`);
  };

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "#0f0a18" }}>
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-[#e91e8c] font-black text-2xl tracking-tight">PlayMyJam</p>
          <p className="text-white text-base font-semibold mt-4">Onayınızı bekleyen bir sözleşme var</p>
          <p className="text-[#9ca3af] text-sm mt-2 max-w-lg mx-auto leading-relaxed">
            Panele ve müzik oynatıcıya devam edebilmek için aşağıdaki sözleşmeyi okuyup onaylamanız gerekiyor.
            Onaylanan sözleşmelere daha sonra panelde <span className="text-white">Sözleşmelerim</span> bölümünden ulaşabilirsiniz.
          </p>
        </div>

        <ContractDocuments onlyPending onAllAccepted={() => window.location.replace(`/admin/${venueId}`)} />

        <div className="mt-8 text-center">
          <button onClick={handleLogout} className="text-xs text-[#6b7280] hover:text-white underline">
            Çıkış yap
          </button>
        </div>
      </div>
    </div>
  );
}
