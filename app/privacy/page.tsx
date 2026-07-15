import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import LegalFooter from "@/components/ui/LegalFooter";

export const metadata: Metadata = { title: "Gizlilik Politikası — PlayMyJam" };

// Türkçe metin Tosla/yerel mevzuat incelemesi için öncelikli; İngilizce orijinal
// metin YouTube API kota başvurusunda referans verildiği için altta korunuyor.
export default function PrivacyPage() {
  return (
    <>
      <main className="max-w-3xl mx-auto px-6 py-16 text-white">
        <h1 className="text-3xl font-bold mb-2">Gizlilik Politikası</h1>
        <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 15 Temmuz 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Giriş</h2>
          <p className="text-gray-300 leading-relaxed">
            PlayMyJam (&quot;biz&quot;), mekan misafirlerinin şarkı isteği göndermesine ve mekan
            yöneticilerinin gömülü YouTube oynatıcısı üzerinden müzik akışını yönetmesine imkan
            veren PlayMyJam platformunu işletir. Bu Gizlilik Politikası, bilgilerinizi nasıl
            topladığımızı, kullandığımızı ve koruduğumuzu açıklar.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. Topladığımız Bilgiler</h2>
          <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
            <li>
              <strong>Şarkı istekleri:</strong> Misafirlerin gönderdiği istek verileri (şarkı adı,
              sanatçı, YouTube video kimliği) saklanır.
            </li>
            <li>
              <strong>Hesap verileri:</strong> Misafir hesaplarında kullanıcı adı ve jeton
              bakiyesi tutulur. YouTube/Google hesap bilgileriniz istenmez ve saklanmaz.
            </li>
            <li>
              <strong>Kullanım verileri:</strong> Platformu iyileştirmek için anonimleştirilmiş
              istatistikler toplanabilir.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. Bilgilerin Kullanımı</h2>
          <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
            <li>Mekan deneyimi içinde şarkı sıralarını göstermek ve yönetmek.</li>
            <li>İstenen şarkıları mekan cihazındaki gömülü YouTube oynatıcısında çalmak.</li>
            <li>Platform performansını ve güvenilirliğini artırmak.</li>
            <li>Ödeme işlemlerini gerçekleştirmek (kart bilgileri tarafımızca saklanmaz; ödemeler lisanslı ödeme kuruluşu üzerinden alınır).</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. YouTube API Hizmetleri</h2>
          <p className="text-gray-300 leading-relaxed">
            PlayMyJam, müzik aramak ve video oynatmak için YouTube API Hizmetlerini (YouTube Data
            API ve gömülü YouTube oynatıcısı) kullanır. PlayMyJam&apos;i kullanarak{" "}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 underline"
            >
              YouTube Hizmet Şartları
            </a>
            &apos;na bağlı olmayı kabul etmiş ve{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 underline"
            >
              Google Gizlilik Politikası
            </a>
            &apos;nı onaylamış olursunuz. PlayMyJam, YouTube&apos;a hiçbir kişisel kullanıcı
            verisi göndermez; gömülü oynatıcı Google&apos;ın politikalarında açıklandığı şekilde
            kendi çerezlerini kullanabilir.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Veri Saklama</h2>
          <p className="text-gray-300 leading-relaxed">
            Şarkı isteği geçmişi operasyonel amaçlarla en fazla 30 gün saklanabilir. Arama
            sorguları API kullanımını azaltmak için en fazla 30 gün önbelleğe alınır ve bireysel
            kullanıcılarla ilişkilendirilmez.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Veri Güvenliği</h2>
          <p className="text-gray-300 leading-relaxed">
            Şifreli depolama ve güvenli HTTPS (SSL) bağlantıları dahil olmak üzere endüstri
            standardı güvenlik önlemleri kullanıyoruz.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. İletişim</h2>
          <p className="text-gray-300 leading-relaxed">
            Gizlilikle ilgili sorularınız için: {COMPANY.legalName},{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
              {COMPANY.email}
            </a>
            , {COMPANY.phone}, {COMPANY.address}, {COMPANY.city}
          </p>
        </section>

        <div className="my-12 border-t border-white/10" />

        <h1 className="text-3xl font-bold mb-2">Privacy Policy (English)</h1>
        <p className="text-gray-400 mb-10 text-sm">Last updated: July 12, 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
          <p className="text-gray-300 leading-relaxed">
            PlayMyJam (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the PlayMyJam
            platform, which allows venue guests to request songs and venue administrators to
            manage music playback via the embedded YouTube player. This Privacy Policy explains
            how we collect, use, and protect your information.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
          <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
            <li>
              <strong>Song requests:</strong> We store song request data (track name, artist,
              YouTube video ID) submitted by venue guests.
            </li>
            <li>
              <strong>Account data:</strong> Guest accounts store a username and per-venue token
              balance. We do not require or store any YouTube/Google account credentials.
            </li>
            <li>
              <strong>Usage data:</strong> We may collect anonymized usage statistics to improve
              the platform.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
          <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
            <li>To display and manage song queues within the venue experience.</li>
            <li>To play requested songs through the embedded YouTube player on the venue device.</li>
            <li>To improve platform performance and reliability.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. YouTube API Services</h2>
          <p className="text-gray-300 leading-relaxed">
            PlayMyJam uses YouTube API Services (YouTube Data API and the YouTube embedded player)
            to search for music and play videos. By using PlayMyJam you agree to be bound by the{" "}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 underline"
            >
              YouTube Terms of Service
            </a>{" "}
            and acknowledge the{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 underline"
            >
              Google Privacy Policy
            </a>
            . PlayMyJam does not send any personal user data to YouTube; the embedded player may
            set its own cookies as described in Google&apos;s policies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
          <p className="text-gray-300 leading-relaxed">
            Song request history may be retained for up to 30 days for operational purposes.
            Search queries are cached for up to 30 days to reduce API usage; they are not linked
            to individual users.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Data Security</h2>
          <p className="text-gray-300 leading-relaxed">
            We use industry-standard security measures including encrypted storage and secure
            HTTPS connections.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Contact</h2>
          <p className="text-gray-300 leading-relaxed">
            For privacy-related inquiries, contact us at:{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
              {COMPANY.email}
            </a>
          </p>
        </section>
      </main>
      <LegalFooter />
    </>
  );
}
