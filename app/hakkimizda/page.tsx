import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "Hakkımızda — PlayMyJam" };

export default function HakkimizdaPage() {
  return (
    <BilingualLegal
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Hakkımızda</h1>
          <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 15 Temmuz 2026</p>

          <section className="mb-8">
            <p className="text-gray-300 leading-relaxed">
              <strong>{COMPANY.brand}</strong>, kafe, restoran ve eğlence mekanlarında çalan müziği
              misafirlerin belirlemesini sağlayan bir dijital şarkı istek platformudur. Misafirler
              bulundukları mekanın şarkı kataloğuna göz atar, jeton satın alır ve jetonlarını
              kullanarak istedikleri şarkıyı çalma sırasına ekler. Mekan işletmecileri ise müzik
              akışını tek panelden yönetir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">Ne Sunuyoruz?</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>Misafirler için: şarkı arama, istek gönderme ve canlı sıra takibi.</li>
              <li>Jeton sistemi: tüm PlayMyJam mekanlarında geçerli dijital jeton cüzdanı.</li>
              <li>Mekanlar için: istek yönetimi, çalma listesi ve istatistik paneli.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">İşletme Bilgileri</h2>
            <p className="text-gray-300 leading-relaxed">
              {COMPANY.brand}, {COMPANY.legalName} tarafından işletilmektedir.
              <br />
              Adres: {COMPANY.address}, {COMPANY.city}
              <br />
              Telefon: {COMPANY.phone}
              <br />
              E-posta:{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
            </p>
          </section>
        </main>
      }
      en={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">About Us</h1>
          <p className="text-gray-400 mb-10 text-sm">Last updated: July 15, 2026</p>

          <section className="mb-8">
            <p className="text-gray-300 leading-relaxed">
              <strong>{COMPANY.brand}</strong> is a digital song-request platform that lets guests
              choose the music playing in cafes, restaurants, and entertainment venues. Guests
              browse the catalog of the venue they are in, purchase tokens, and use their tokens to
              add the songs they want to the play queue. Venue operators manage the music flow from
              a single dashboard.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">What We Offer</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>For guests: song search, request submission, and live queue tracking.</li>
              <li>Token system: a digital token wallet valid across all PlayMyJam venues.</li>
              <li>For venues: request management, playlist, and analytics dashboard.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">Business Information</h2>
            <p className="text-gray-300 leading-relaxed">
              {COMPANY.brand} is operated by {COMPANY.legalName}.
              <br />
              Address: {COMPANY.address}, {COMPANY.city}
              <br />
              Phone: {COMPANY.phone}
              <br />
              Email:{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
            </p>
          </section>
        </main>
      }
    />
  );
}
