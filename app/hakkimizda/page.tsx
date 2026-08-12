import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "Hakkımızda — PlayMyJam" };

export default function HakkimizdaPage() {
  return (
    <BilingualLegal
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">PlayMyJam Hakkında</h1>
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

          {/* Google OAuth marka/kapsam doğrulaması bu bölümü şart koşuyor: onay ekranında
              "home page" olarak verilen sayfa, istenen Google kullanıcı verisinin ne için
              kullanıldığını açıkça yazmalı (Google Cloud Console Help, 13807376). */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">Google Hesabı Verilerinin Kullanımı</h2>
            <p className="text-gray-300 leading-relaxed">
              Mekan işletmecileri {COMPANY.brand} yönetim paneline Google hesaplarıyla giriş
              yapabilir. Bu girişte Google&apos;dan yalnızca <strong>temel profil bilgileri</strong>{" "}
              (ad ve e-posta adresi) alınır; bunlar mekanın yönetici hesabını oluşturmak ve
              güvenliğini sağlamak için kullanılır.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Bir mekan kendi YouTube çalma listelerini panele aktarmak isterse, ek olarak o
              hesabın YouTube çalma listelerine <strong>yalnızca okuma izni</strong>{" "}
              (<code className="text-purple-300">youtube.readonly</code>) istenir. Bu izin sadece
              listelerin adlarını ve içerdikleri videoları okuyup mekanın {COMPANY.brand}{" "}
              kataloğuna kopyalamak için kullanılır. YouTube hesabınızda hiçbir değişiklik
              yapılmaz: video veya liste oluşturulmaz, düzenlenmez, silinmez, hiçbir içerik
              yüklenmez.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Google&apos;dan alınan veriler yalnızca yukarıdaki amaçlarla kullanılır; reklam için
              işlenmez, satılmaz ve üçüncü taraflara devredilmez. {COMPANY.brand}, Google API
              Hizmetleri Kullanıcı Verileri Politikası&apos;na ve bu politikanın Sınırlı Kullanım
              (Limited Use) şartlarına uygun hareket eder. Ayrıntılar için{" "}
              <a href="/privacy" className="text-purple-400 underline">
                Gizlilik Politikası
              </a>
              . Misafirlerin şarkı istemek için Google hesabına ihtiyacı yoktur.
            </p>
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
          <h1 className="text-3xl font-bold mb-2">About PlayMyJam</h1>
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
            <h2 className="text-xl font-semibold mb-3">Use of Google Account Data</h2>
            <p className="text-gray-300 leading-relaxed">
              Venue operators can sign in to the {COMPANY.brand} management dashboard with their
              Google account. During this sign-in we receive only <strong>basic profile
              information</strong> (name and email address), which is used to create and secure the
              venue&apos;s administrator account.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              If a venue chooses to import its own YouTube playlists into the dashboard, we
              additionally request <strong>read-only access</strong> to that account&apos;s YouTube
              playlists (<code className="text-purple-300">youtube.readonly</code>). This permission
              is used solely to read the playlist names and the videos they contain, and to copy
              them into the venue&apos;s {COMPANY.brand} catalog. Nothing in your YouTube account is
              changed: we never create, edit, or delete videos or playlists, and we never upload any
              content.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Data obtained from Google is used only for the purposes above; it is not processed for
              advertising, sold, or transferred to third parties. {COMPANY.brand}&apos;s use of
              information received from Google APIs adheres to the Google API Services User Data
              Policy, including the Limited Use requirements. For details, see our{" "}
              <a href="/privacy" className="text-purple-400 underline">
                Privacy Policy
              </a>
              . Guests do not need a Google account to request songs.
            </p>
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
