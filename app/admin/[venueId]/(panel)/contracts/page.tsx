"use client";

import ContractDocuments from "@/components/admin/ContractDocuments";

export default function AdminContractsPage() {
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Sözleşmelerim</h1>
        <p className="text-[#6b7280] text-sm mt-1">PlayMyJam ile imzaladığınız sözleşmeler ve onay kayıtları</p>
      </div>
      <ContractDocuments />
    </div>
  );
}
