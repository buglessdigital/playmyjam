import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import LegalFooter from "@/components/ui/LegalFooter";

export const metadata: Metadata = { title: "İletişim — PlayMyJam" };

export default function IletisimPage() {
  return (
    <>
      <main className="max-w-3xl mx-auto px-6 py-16 text-white">
        <h1 className="text-3xl font-bold mb-2">İletişim</h1>
        <p className="text-gray-400 mb-10 text-sm">
          Soruların, iade talepleri ve iş birlikleri için bize ulaşabilirsin.
        </p>

        <dl className="space-y-6 text-gray-300 leading-relaxed">
          <div>
            <dt className="font-semibold text-white">İşletme Sahibi</dt>
            <dd>
              {COMPANY.legalName} — {COMPANY.brand}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-white">E-posta</dt>
            <dd>
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-white">Telefon</dt>
            <dd>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}>{COMPANY.phone}</a>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-white">Adres</dt>
            <dd>
              {COMPANY.address}, {COMPANY.city}
            </dd>
          </div>
        </dl>
      </main>
      <LegalFooter />
    </>
  );
}
