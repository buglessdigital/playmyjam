import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "Kullanım Şartları — PlayMyJam" };

export default function TermsPage() {
  return (
    <BilingualLegal
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Kullanım Şartları</h1>
          <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 15 Temmuz 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Şartların Kabulü</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam&apos;i kullanarak bu Kullanım Şartları&apos;nı kabul etmiş olursunuz. Kabul
              etmiyorsanız platformu kullanmayınız. Bu şartlar mekan yöneticileri ve misafirler
              dahil tüm kullanıcılar için geçerlidir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Hizmetin Tanımı</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam, mekan misafirlerinin şarkı önermesine ve mekan yöneticilerinin bir mekan
              cihazında çalışan gömülü YouTube oynatıcısı üzerinden müzik akışını yönetmesine imkan
              veren bir müzik istek platformudur. PlayMyJam bir sıra yönetimi yazılımıdır; müzik
              için umuma açık icra lisansı sağlamaz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. YouTube Gereklilikleri</h2>
            <p className="text-gray-300 leading-relaxed">
              Oynatma, YouTube API Hizmetleri üzerinden sağlanır. PlayMyJam&apos;i kullanarak{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                YouTube Hizmet Şartları
              </a>
              &apos;na bağlı olmayı kabul edersiniz. Müzik çalarken video oynatıcısı görünür kalmak
              zorundadır; mekanlar, YouTube şartlarına ve bulundukları yerde geçerli umuma açık icra
              lisanslama yükümlülüklerine (ör. meslek birlikleri) uymaktan sorumludur.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Kabul Edilebilir Kullanım</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>PlayMyJam&apos;i herhangi bir yasa dışı amaçla kullanamazsınız.</li>
              <li>Şarkı istek sistemini manipüle etmeye veya kötüye kullanmaya çalışamazsınız.</li>
              <li>Zararlı, saldırgan veya üçüncü kişilerin haklarını ihlal eden içerik isteyemezsiniz.</li>
              <li>Mekan yöneticileri, mekanlarında çalınan içerikten sorumludur.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Fikri Mülkiyet</h2>
            <p className="text-gray-300 leading-relaxed">
              Tüm müzik içeriği YouTube üzerinden sağlanır ve YouTube&apos;un lisans sözleşmelerine
              tabidir. PlayMyJam hiçbir ses veya video içeriğini barındırmaz, saklamaz, indirmez
              veya dağıtmaz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Sorumluluğun Sınırlandırılması</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam, hiçbir garanti verilmeksizin &quot;olduğu gibi&quot; sunulur. Hizmet
              kesintilerinden, YouTube API kesintilerinden veya platformu kullanımınızdan doğan
              dolaylı zararlardan sorumlu değiliz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Şartlarda Değişiklik</h2>
            <p className="text-gray-300 leading-relaxed">
              Bu şartları herhangi bir zamanda güncelleyebiliriz. Değişikliklerin ardından
              PlayMyJam&apos;i kullanmaya devam etmeniz, yeni şartların kabulü anlamına gelir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. İletişim</h2>
            <p className="text-gray-300 leading-relaxed">
              Bu şartlarla ilgili sorularınız için:{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
            </p>
          </section>
        </main>
      }
      en={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-gray-400 mb-10 text-sm">Last updated: July 15, 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              By using PlayMyJam, you agree to these Terms of Service. If you do not agree, do not
              use the platform. These terms apply to all users, including venue administrators and
              guests.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam is a music request platform that allows venue guests to suggest songs and
              venue administrators to manage music playback through an embedded YouTube player
              running on a venue device. PlayMyJam is queue-management software; it does not itself
              provide a public performance licence for music.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. YouTube Requirements</h2>
            <p className="text-gray-300 leading-relaxed">
              Playback is provided through YouTube API Services. By using PlayMyJam you agree to be
              bound by the{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                YouTube Terms of Service
              </a>
              . The video player must remain visible while music plays; venues are responsible for
              complying with YouTube&apos;s terms and with any public performance licensing
              obligations (e.g. collecting societies) applicable at their location.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>You may not use PlayMyJam for any unlawful purpose.</li>
              <li>You may not attempt to manipulate or abuse the song request system.</li>
              <li>You may not request content that is harmful, offensive, or violates third-party rights.</li>
              <li>Venue administrators are responsible for content played at their venue.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Intellectual Property</h2>
            <p className="text-gray-300 leading-relaxed">
              All music content is provided through YouTube and subject to their licensing
              agreements. PlayMyJam does not host, store, download, or distribute any audio or
              video content.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam is provided &quot;as is&quot; without warranties of any kind. We are not
              liable for service interruptions, YouTube API outages, or any indirect damages
              arising from your use of the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Changes to Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update these terms at any time. Continued use of PlayMyJam after changes
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
            <p className="text-gray-300 leading-relaxed">
              For questions about these terms, contact us at:{" "}
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
